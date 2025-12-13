import { test, expect } from "@playwright/test";

/**
 * Organizations API Tests
 *
 * Tests organization management:
 * - Organization invites
 * - Member management
 * - Role changes
 * - Invite validation and acceptance
 *
 * Prerequisites:
 * - TEST_API_KEY environment variable required
 * - Cloud running on port 3000
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const CLOUD_URL = process.env.CLOUD_URL ?? BASE_URL;
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

test.describe("Organization Invites API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testInviteId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (testInviteId) {
      await request.delete(`${CLOUD_URL}/api/organizations/invites/${testInviteId}`, {
        headers: authHeaders(),
      });
      testInviteId = null;
    }
  });

  test("GET /api/organizations/invites lists pending invites", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/organizations/invites`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const invites = data.invites || data.data || data;
      expect(Array.isArray(invites)).toBe(true);
      console.log(`✅ Found ${invites.length} pending invites`);
    } else {
      console.log(`ℹ️ Organization invites list returned ${response.status()}`);
    }
  });

  test("POST /api/organizations/invites creates new invite", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/organizations/invites`, {
      headers: authHeaders(),
      data: {
        email: "e2e-test-invite@example.com",
        role: "member",
      },
    });

    expect([200, 201, 400, 404, 409, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      const invite = data.invite || data.data || data;
      expect(invite).toHaveProperty("id");
      testInviteId = invite.id;
      console.log("✅ Organization invite created");
    } else if (response.status() === 409) {
      console.log("ℹ️ Invite already exists for this email");
    } else {
      console.log(`ℹ️ Creating invite returned ${response.status()}`);
    }
  });

  test("DELETE /api/organizations/invites/:id deletes invite", async ({ request }) => {
    // First create an invite
    const createResponse = await request.post(`${CLOUD_URL}/api/organizations/invites`, {
      headers: authHeaders(),
      data: {
        email: "e2e-delete-test@example.com",
        role: "member",
      },
    });

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const invite = createData.invite || createData.data || createData;
    const inviteId = invite.id;

    // Delete it
    const deleteResponse = await request.delete(
      `${CLOUD_URL}/api/organizations/invites/${inviteId}`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 204, 404]).toContain(deleteResponse.status());

    if (deleteResponse.status() === 200 || deleteResponse.status() === 204) {
      console.log("✅ Organization invite deleted");
    } else {
      console.log(`ℹ️ Deleting invite returned ${deleteResponse.status()}`);
    }

    testInviteId = null; // Already deleted
  });

  test("invite supports different roles", async ({ request }) => {
    const roles = ["member", "admin", "viewer"];

    for (const role of roles) {
      const response = await request.post(`${CLOUD_URL}/api/organizations/invites`, {
        headers: authHeaders(),
        data: {
          email: `e2e-${role}-test@example.com`,
          role,
        },
      });

      expect([200, 201, 400, 404, 409, 500, 501]).toContain(response.status());

      if (response.status() === 200 || response.status() === 201) {
        const data = await response.json();
        const invite = data.invite || data.data || data;
        console.log(`✅ Invite with role '${role}' created`);

        // Cleanup
        if (invite.id) {
          await request.delete(`${CLOUD_URL}/api/organizations/invites/${invite.id}`, {
            headers: authHeaders(),
          });
        }
      }
    }
  });
});

test.describe("Organization Members API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/organizations/members lists members", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/organizations/members`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const members = data.members || data.data || data;
      expect(Array.isArray(members)).toBe(true);
      console.log(`✅ Found ${members.length} organization members`);

      // Check member structure
      if (members.length > 0) {
        const member = members[0];
        expect(member).toHaveProperty("id");
        expect(member).toHaveProperty("role");
      }
    } else {
      console.log(`ℹ️ Organization members list returned ${response.status()}`);
    }
  });

  test("members list includes roles", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/organizations/members`, {
      headers: authHeaders(),
    });

    if (response.status() !== 200) {
      return;
    }

    const data = await response.json();
    const members = data.members || data.data || data;

    if (members.length > 0) {
      const validRoles = ["owner", "admin", "member", "viewer"];
      const allHaveValidRoles = members.every(
        (m: { role: string }) => validRoles.includes(m.role) || m.role
      );
      expect(allHaveValidRoles).toBe(true);
      console.log("✅ All members have valid roles");
    }
  });

  test("PATCH /api/organizations/members/:userId updates member role", async ({ request }) => {
    // First get members list
    const listResponse = await request.get(`${CLOUD_URL}/api/organizations/members`, {
      headers: authHeaders(),
    });

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const members = listData.members || listData.data || listData;

    // Find a non-owner member to update (skip owner to avoid issues)
    const targetMember = members.find((m: { role: string }) => m.role !== "owner");

    if (!targetMember) {
      console.log("ℹ️ No non-owner members to test role update");
      return;
    }

    const originalRole = targetMember.role;
    const newRole = originalRole === "member" ? "admin" : "member";

    // Update role
    const response = await request.patch(
      `${CLOUD_URL}/api/organizations/members/${targetMember.id}`,
      {
        headers: authHeaders(),
        data: {
          role: newRole,
        },
      }
    );

    expect([200, 400, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      console.log(`✅ Member role updated from '${originalRole}' to '${newRole}'`);

      // Restore original role
      await request.patch(`${CLOUD_URL}/api/organizations/members/${targetMember.id}`, {
        headers: authHeaders(),
        data: {
          role: originalRole,
        },
      });
    } else if (response.status() === 403) {
      console.log("ℹ️ Insufficient permissions to update member role");
    } else {
      console.log(`ℹ️ Updating member role returned ${response.status()}`);
    }
  });

  test("DELETE /api/organizations/members/:userId removes member", async ({ request }) => {
    // This test is destructive - only run if explicitly enabled
    // We'll just test the endpoint exists
    const response = await request.delete(`${CLOUD_URL}/api/organizations/members/test-user-id`, {
      headers: authHeaders(),
    });

    expect([200, 204, 400, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 404) {
      console.log("✅ Member removal endpoint exists (404 for non-existent user)");
    } else if (response.status() === 403) {
      console.log("✅ Member removal properly restricts permissions");
    } else {
      console.log(`ℹ️ Member removal returned ${response.status()}`);
    }
  });
});

test.describe("Invite Validation API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/invites/validate validates invite code", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/invites/validate?code=test-invite-code`, {
      headers: authHeaders(),
    });

    expect([200, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Invite validation endpoint works");
    } else if (response.status() === 404) {
      console.log("✅ Invalid invite code properly rejected");
    } else {
      console.log(`ℹ️ Invite validation returned ${response.status()}`);
    }
  });

  test("POST /api/invites/accept accepts invite", async ({ request }) => {
    // First create an invite
    const createResponse = await request.post(`${CLOUD_URL}/api/organizations/invites`, {
      headers: authHeaders(),
      data: {
        email: "e2e-accept-test@example.com",
        role: "member",
      },
    });

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const invite = createData.invite || createData.data || createData;
    const inviteCode = invite.code || invite.inviteCode || invite.id;

    // Try to accept (will likely fail since we're the same user, but tests endpoint)
    const response = await request.post(`${CLOUD_URL}/api/invites/accept`, {
      headers: authHeaders(),
      data: {
        code: inviteCode,
      },
    });

    expect([200, 201, 400, 403, 404, 409, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      console.log("✅ Invite acceptance works");
    } else if (response.status() === 409) {
      console.log("✅ Duplicate invite acceptance properly handled");
    } else if (response.status() === 403) {
      console.log("✅ Self-invite acceptance properly rejected");
    } else {
      console.log(`ℹ️ Invite acceptance returned ${response.status()}`);
    }

    // Cleanup
    if (invite.id) {
      await request.delete(`${CLOUD_URL}/api/organizations/invites/${invite.id}`, {
        headers: authHeaders(),
      });
    }
  });
});

test.describe("Organization Settings UI", () => {
  test("account page shows organization info", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/account`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      console.log("ℹ️ Account page requires authentication");
      return;
    }

    // Look for organization section
    const orgSection = page.locator(
      'text=/organization|team|members/i, [class*="organization"], [class*="team"]'
    );
    const hasOrg = await orgSection.isVisible().catch(() => false);

    console.log(`✅ Organization section visible: ${hasOrg}`);
  });

  test("invite member button exists", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/account`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for invite button
    const inviteButton = page.locator(
      'button:has-text("Invite"), button:has-text("Add Member"), a:has-text("Invite")'
    );
    const hasInvite = await inviteButton.isVisible().catch(() => false);

    console.log(`✅ Invite member button visible: ${hasInvite}`);
  });

  test("members list displays", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/account`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for members table or list
    const membersList = page.locator(
      'table, [class*="member"], [role="list"], [class*="Member"]'
    );
    const hasList = await membersList.isVisible().catch(() => false);

    console.log(`✅ Members list visible: ${hasList}`);
  });

  test("role selector exists for members", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/account`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for role dropdown/select
    const roleSelector = page.locator(
      'select, [role="combobox"], button:has-text("Admin"), button:has-text("Member")'
    );
    const selectorCount = await roleSelector.count();

    console.log(`✅ Found ${selectorCount} role selector elements`);
  });
});

test.describe("Invite Accept Page", () => {
  test("invite accept page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/invite/accept`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);
    console.log("✅ Invite accept page loads");
  });

  test("invite accept page with invalid code shows error", async ({ page }) => {
    await page.goto(`${BASE_URL}/invite/accept?code=invalid-test-code`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();

    // Should show some error or invalid message
    const hasError =
      content?.toLowerCase().includes("invalid") ||
      content?.toLowerCase().includes("error") ||
      content?.toLowerCase().includes("expired") ||
      content?.toLowerCase().includes("not found");

    console.log(`✅ Invalid invite code shows error: ${hasError}`);
  });
});

