import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const TEST_SECRET = "milady-cron-secret";

const readResultsQueue: unknown[][] = [];
const txUpdateResultsQueue: unknown[][] = [];
const txInsertResultsQueue: unknown[][] = [];
const writeUpdateResultsQueue: unknown[][] = [];
const txUpdateSetCalls: Array<Record<string, unknown>> = [];
const writeUpdateSetCalls: Array<Record<string, unknown>> = [];
let previousCronSecret: string | undefined;
let previousAppUrl: string | undefined;

function createReadBuilder(result: unknown[]) {
  return {
    from() {
      return {
        where() {
          return Promise.resolve(result);
        },
      };
    },
  };
}

function createAwaitableUpdateResult(result: unknown[]) {
  const promise = Promise.resolve(result) as Promise<unknown[]> & {
    returning: () => Promise<unknown[]>;
  };
  promise.returning = () => promise;
  return promise;
}

function createUpdateBuilder(queue: unknown[][], setCalls: Array<Record<string, unknown>>) {
  const result = queue.shift() ?? [];

  return {
    set(values: Record<string, unknown>) {
      setCalls.push(values);
      return {
        where() {
          return createAwaitableUpdateResult(result);
        },
      };
    },
  };
}

function createInsertBuilder(queue: unknown[][]) {
  const result = queue.shift() ?? [];

  return {
    values() {
      return {
        returning() {
          return Promise.resolve(result);
        },
      };
    },
  };
}

type MiladyBillingTestTx = {
  update: () => ReturnType<typeof createUpdateBuilder>;
  insert: () => ReturnType<typeof createInsertBuilder>;
};

const mockListByOrganization = mock(async () => []);
const mockSendContainerShutdownWarningEmail = mock(async () => undefined);
const mockTrackServerEvent = mock(() => undefined);
const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
};

function registerMiladyBillingMocks(): void {
  // Inline closures (not `mock.fn`) so re-registering after other tests' `mock.module("@/db/client")`
  // always wires `@/db/client` to these queue-backed implementations.
  mock.module("@/db/client", () => ({
    dbRead: {
      select: () => createReadBuilder(readResultsQueue.shift() ?? []),
    },
    dbWrite: {
      update: () => createUpdateBuilder(writeUpdateResultsQueue, writeUpdateSetCalls),
      transaction: async (callback: (tx: MiladyBillingTestTx) => Promise<unknown>) =>
        callback({
          update: () => createUpdateBuilder(txUpdateResultsQueue, txUpdateSetCalls),
          insert: () => createInsertBuilder(txInsertResultsQueue),
        }),
    },
  }));

  mock.module("@/db/repositories", () => ({
    usersRepository: {
      listByOrganization: mockListByOrganization,
    },
  }));

  mock.module("@/lib/services/email", () => ({
    emailService: {
      sendContainerShutdownWarningEmail: mockSendContainerShutdownWarningEmail,
    },
  }));

  mock.module("@/lib/analytics/posthog-server", () => ({
    trackServerEvent: mockTrackServerEvent,
  }));

  mock.module("@/lib/utils/logger", () => ({
    logger: mockLogger,
  }));
}

registerMiladyBillingMocks();

async function importRoute() {
  return import("@/app/api/cron/milady-billing/route");
}

function createRequest(): NextRequest {
  return new NextRequest("https://example.com/api/cron/milady-billing", {
    method: "GET",
    headers: {
      authorization: `Bearer ${TEST_SECRET}`,
    },
  });
}

function enqueueBaseReadState({
  sandbox,
  orgBalance = "5.0000",
  billingEmail = "billing@example.com",
}: {
  sandbox: Record<string, unknown>;
  orgBalance?: string;
  billingEmail?: string | null;
}) {
  readResultsQueue.push(
    [sandbox],
    [],
    [{ id: "org-1", name: "Milady Org", credit_balance: orgBalance }],
    billingEmail === null ? [] : [{ organization_id: "org-1", billing_email: billingEmail }],
  );
}

describe("Milady billing cron", () => {
  beforeEach(() => {
    registerMiladyBillingMocks();

    previousCronSecret = process.env.CRON_SECRET;
    previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;

    readResultsQueue.length = 0;
    txUpdateResultsQueue.length = 0;
    txInsertResultsQueue.length = 0;
    writeUpdateResultsQueue.length = 0;
    txUpdateSetCalls.length = 0;
    writeUpdateSetCalls.length = 0;

    process.env.CRON_SECRET = TEST_SECRET;
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";

    mockListByOrganization.mockClear();
    mockListByOrganization.mockResolvedValue([]);
    mockSendContainerShutdownWarningEmail.mockClear();
    mockTrackServerEvent.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    if (previousCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousCronSecret;
    }

    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
  });

  test("skips a sandbox cleanly when another run already billed it", async () => {
    enqueueBaseReadState({
      sandbox: {
        id: "sandbox-1",
        agent_name: "Already Billed",
        organization_id: "org-1",
        user_id: "user-1",
        status: "running",
        billing_status: "active",
        last_billed_at: null,
        total_billed: "1.00",
        shutdown_warning_sent_at: null,
        scheduled_shutdown_at: null,
      },
    });

    txUpdateResultsQueue.push([]);

    const { GET } = await importRoute();
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.sandboxesProcessed).toBe(1);
    expect(body.data.sandboxesBilled).toBe(0);
    expect(body.data.warningsSent).toBe(0);
    expect(body.data.errors).toBe(0);
    expect(body.data.results[0]).toEqual(
      expect.objectContaining({
        action: "skipped",
        error: "Already billed recently",
      }),
    );
    expect(mockSendContainerShutdownWarningEmail).not.toHaveBeenCalled();
  });

  test("sends a shutdown warning when the atomic org debit is rejected", async () => {
    enqueueBaseReadState({
      sandbox: {
        id: "sandbox-1",
        agent_name: "Low Balance",
        organization_id: "org-1",
        user_id: "user-1",
        status: "running",
        billing_status: "active",
        last_billed_at: null,
        total_billed: "1.00",
        shutdown_warning_sent_at: null,
        scheduled_shutdown_at: null,
      },
      orgBalance: "1.0000",
    });

    // getOrgBalance in queueShutdownWarning + second refresh after warning_sent in the handler loop
    readResultsQueue.push([{ credit_balance: "0.0010" }], [{ credit_balance: "0.0010" }]);

    txUpdateResultsQueue.push([{ id: "sandbox-1" }], []);
    writeUpdateResultsQueue.push([]);

    const { GET } = await importRoute();
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.sandboxesProcessed).toBe(1);
    expect(body.data.sandboxesBilled).toBe(0);
    expect(body.data.warningsSent).toBe(1);
    expect(body.data.errors).toBe(0);
    expect(body.data.results[0]).toEqual(
      expect.objectContaining({
        action: "warning_sent",
      }),
    );
    expect(mockSendContainerShutdownWarningEmail).toHaveBeenCalledTimes(1);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "user-1",
      "milady_agent_shutdown_warning_sent",
      expect.objectContaining({
        sandbox_id: "sandbox-1",
        current_balance: 0.001,
      }),
    );
    expect(writeUpdateSetCalls[0]).toEqual(
      expect.objectContaining({
        billing_status: "shutdown_pending",
      }),
    );
  });

  test("persists the billed hourly rate when a charge succeeds", async () => {
    enqueueBaseReadState({
      sandbox: {
        id: "sandbox-1",
        agent_name: "Bill Me",
        organization_id: "org-1",
        user_id: "user-1",
        status: "running",
        billing_status: "active",
        last_billed_at: null,
        total_billed: "1.00",
        shutdown_warning_sent_at: null,
        scheduled_shutdown_at: null,
      },
    });

    txUpdateResultsQueue.push([{ id: "sandbox-1" }], [{ credit_balance: "4.9800" }], []);
    txInsertResultsQueue.push([{ id: "credit-tx-1" }]);

    const { GET } = await importRoute();
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.sandboxesBilled).toBe(1);
    expect(body.data.totalRevenue).toBe(0.01);
    expect(txUpdateSetCalls).toContainEqual(
      expect.objectContaining({
        billing_status: "active",
        hourly_rate: "0.01",
      }),
    );
  });

  test("marks a billed sandbox as warning when the remaining balance is low", async () => {
    enqueueBaseReadState({
      sandbox: {
        id: "sandbox-1",
        agent_name: "Warn Me",
        organization_id: "org-1",
        user_id: "user-1",
        status: "running",
        billing_status: "active",
        last_billed_at: null,
        total_billed: "1.00",
        shutdown_warning_sent_at: null,
        scheduled_shutdown_at: null,
      },
      orgBalance: "2.0100",
    });

    txUpdateResultsQueue.push([{ id: "sandbox-1" }], [{ credit_balance: "1.9900" }], []);
    txInsertResultsQueue.push([{ id: "credit-tx-1" }]);

    const { GET } = await importRoute();
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.sandboxesBilled).toBe(1);
    expect(txUpdateSetCalls).toContainEqual(
      expect.objectContaining({
        billing_status: "warning",
        hourly_rate: "0.01",
      }),
    );
  });
});
