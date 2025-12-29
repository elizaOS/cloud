import { group, sleep } from "k6";
import { httpPost } from "../../helpers/http";
import { Counter, Trend } from "k6/metrics";

const webhooksProcessed = new Counter("telegram_webhooks_processed");
const webhookLatency = new Trend("telegram_webhook_latency");

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; is_bot: boolean };
    chat: { id: number; type: string };
    date: number;
    text: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string; is_bot: boolean };
    data: string;
  };
}

let updateId = Date.now();

function createMessageUpdate(text: string, chatId: number): TelegramUpdate {
  return {
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      text,
      from: { id: 123456789, first_name: "LoadTest", is_bot: false },
      chat: { id: chatId, type: "private" },
    },
  };
}

function createCallbackUpdate(data: string, chatId: number): TelegramUpdate {
  return {
    update_id: ++updateId,
    callback_query: {
      id: `${updateId}`,
      data,
      from: { id: 123456789, first_name: "LoadTest", is_bot: false },
    },
  };
}

export function sendTelegramUpdate(update: TelegramUpdate): boolean {
  const start = Date.now();
  const body = httpPost("/webhooks/telegram", update, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${__ENV.INTERNAL_API_KEY || "local-dev-internal-key"}`,
    },
    tags: { endpoint: "telegram" },
  });
  webhookLatency.add(Date.now() - start);
  if (!body) return false;
  webhooksProcessed.add(1);
  return true;
}

export function telegramMessageTraffic() {
  group("Telegram Messages", () => {
    const chatId = 123456789;
    for (const msg of ["/start", "Hello!", "Thanks!"]) {
      sendTelegramUpdate(createMessageUpdate(msg, chatId));
      sleep(0.1);
    }
  });
  sleep(0.5);
}

export function telegramCallbackTraffic() {
  group("Telegram Callbacks", () => {
    const chatId = 123456789;
    for (const cb of ["action_1", "confirm_yes"]) {
      sendTelegramUpdate(createCallbackUpdate(cb, chatId));
      sleep(0.1);
    }
  });
  sleep(0.5);
}

export function telegramGroupBurst() {
  group("Telegram Group Burst", () => {
    const groupId = -1001234567890;
    for (let i = 0; i < 10; i++)
      sendTelegramUpdate(createMessageUpdate(`Message ${i}`, groupId));
  });
  sleep(1);
}

export function telegramWebhookCycle() {
  const ops = [
    telegramMessageTraffic,
    telegramCallbackTraffic,
    telegramGroupBurst,
  ];
  ops[__ITER % ops.length]();
}

export default function main() {
  telegramWebhookCycle();
}
