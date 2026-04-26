#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

async function build() {
  if (existsSync("dist")) {
    await Bun.$`rm -rf dist`;
  }
  await mkdir("dist", { recursive: true });

  const result = await Bun.build({
    entrypoints: ["src/index.ts"],
    outdir: "dist",
    target: "node",
    format: "esm",
    sourcemap: "external",
    minify: false,
  });

  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join("\n"));
  }

  await Bun.$`tsc --project tsconfig.json --emitDeclarationOnly --noEmit false`;
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
