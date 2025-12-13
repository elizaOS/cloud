#!/usr/bin/env bun
/**
 * Debug script to understand Drizzle query object shapes
 */

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schemas";

function inspectObject(label: string, obj: unknown): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📦 ${label}`);
  console.log("=".repeat(60));
  
  if (obj === null || obj === undefined) {
    console.log("  Value: null/undefined");
    return;
  }

  console.log(`  Type: ${typeof obj}`);
  console.log(`  Constructor: ${obj?.constructor?.name || "unknown"}`);
  
  if (typeof obj === "object") {
    const keys = Object.keys(obj as object);
    console.log(`  Keys: [${keys.join(", ")}]`);
    
    // Check for common patterns
    const o = obj as Record<string, unknown>;
    
    if ("sql" in o) {
      console.log(`  .sql = ${typeof o.sql === "string" ? `"${o.sql.substring(0, 100)}..."` : typeof o.sql}`);
    }
    
    if ("queryChunks" in o) {
      const chunks = o.queryChunks as unknown[];
      console.log(`  .queryChunks = Array(${chunks?.length || 0})`);
      if (chunks && chunks.length > 0) {
        console.log(`    First chunk type: ${typeof chunks[0]}`);
        console.log(`    First chunk: ${JSON.stringify(chunks[0])?.substring(0, 200)}`);
      }
    }
    
    if ("toSQL" in o && typeof o.toSQL === "function") {
      console.log(`  .toSQL() exists`);
      try {
        const result = (o.toSQL as () => unknown)();
        console.log(`    Result type: ${typeof result}`);
        if (result && typeof result === "object") {
          const r = result as Record<string, unknown>;
          if ("sql" in r) {
            console.log(`    .sql = "${String(r.sql).substring(0, 100)}..."`);
          }
        }
      } catch (e) {
        console.log(`    .toSQL() threw: ${e}`);
      }
    }
    
    if ("getSQL" in o && typeof o.getSQL === "function") {
      console.log(`  .getSQL() exists`);
      try {
        const result = (o.getSQL as () => unknown)();
        console.log(`    Result: ${JSON.stringify(result)?.substring(0, 200)}`);
      } catch (e) {
        console.log(`    .getSQL() threw: ${e}`);
      }
    }
  }
}

async function main() {
  console.log("🔍 Debugging Drizzle Query Object Shapes\n");

  // 1. sql template literal
  const sqlTemplate = sql`SELECT * FROM users WHERE id = ${1}`;
  inspectObject("sql`` template literal", sqlTemplate);

  // 2. db.execute argument
  inspectObject("Argument to db.execute()", sqlTemplate);

  // 3. Query builder - select
  const selectQuery = db.select().from(schema.users);
  inspectObject("db.select().from(users)", selectQuery);

  // 4. Query builder with where
  const selectWithWhere = db.select().from(schema.users).where(sql`id = 1`);
  inspectObject("db.select().from(users).where()", selectWithWhere);

  // 5. Check if query builders have internal SQL
  const internalKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(selectQuery));
  console.log(`\n📋 Query builder prototype methods: ${internalKeys.slice(0, 20).join(", ")}...`);

  // 6. Try to find SQL on query builder
  const sq = selectQuery as unknown as Record<string, unknown>;
  console.log("\n🔎 Searching for SQL in query builder...");
  
  // Check config
  if (sq.config && typeof sq.config === "object") {
    console.log("  Found .config:", Object.keys(sq.config as object));
  }
  
  // Check _
  if (sq._ && typeof sq._ === "object") {
    console.log("  Found ._:", Object.keys(sq._ as object));
  }

  // Try prepare
  if (typeof sq.prepare === "function") {
    console.log("  Found .prepare()");
    try {
      const prepared = (sq.prepare as () => unknown)();
      inspectObject(".prepare() result", prepared);
    } catch (e) {
      console.log(`    .prepare() threw: ${e}`);
    }
  }

  // Try getQuery
  if (typeof sq.getQuery === "function") {
    console.log("  Found .getQuery()");
    try {
      const query = (sq.getQuery as () => unknown)();
      inspectObject(".getQuery() result", query);
    } catch (e) {
      console.log(`    .getQuery() threw: ${e}`);
    }
  }

  console.log("\n✅ Debug complete");
  process.exit(0);
}

main().catch(console.error);

