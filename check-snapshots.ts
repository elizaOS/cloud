import { dbRead } from "./db/client";
import { appSandboxSessions, sessionFileSnapshots } from "./db/schemas/app-sandboxes";
import { eq, desc } from "drizzle-orm";

async function check() {
  const appId = "7e8570c9-c9a7-46bf-b2af-4f66df0d2572";
  console.log("=== Checking sessions for app:", appId, "===");
  
  const allSessions = await dbRead
    .select({
      id: appSandboxSessions.id,
      app_id: appSandboxSessions.app_id,
      organization_id: appSandboxSessions.organization_id,
      user_id: appSandboxSessions.user_id,
      status: appSandboxSessions.status,
      created_at: appSandboxSessions.created_at,
    })
    .from(appSandboxSessions)
    .where(eq(appSandboxSessions.app_id, appId))
    .orderBy(desc(appSandboxSessions.created_at));
  
  console.log("Sessions found:", allSessions.length);
  console.log(JSON.stringify(allSessions, null, 2));
  
  if (allSessions.length > 0) {
    console.log("\n=== Checking snapshots ===");
    for (const session of allSessions) {
      const snapshots = await dbRead
        .select({ id: sessionFileSnapshots.id, file_path: sessionFileSnapshots.file_path })
        .from(sessionFileSnapshots)
        .where(eq(sessionFileSnapshots.sandbox_session_id, session.id));
      console.log("Session", session.id, ":", snapshots.length, "snapshots");
    }
  }
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
