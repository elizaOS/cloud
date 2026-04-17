#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const coreDistFiles = [
  path.join(
    repoRoot,
    "node_modules",
    "@elizaos",
    "core",
    "dist",
    "browser",
    "index.browser.js",
  ),
  path.join(
    repoRoot,
    "node_modules",
    "@elizaos",
    "core",
    "dist",
    "edge",
    "index.edge.js",
  ),
  path.join(
    repoRoot,
    "node_modules",
    "@elizaos",
    "core",
    "dist",
    "node",
    "index.node.js",
  ),
];

let patchedFiles = 0;
let patchedCalls = 0;

for (const filePath of coreDistFiles) {
  if (!existsSync(filePath)) {
    continue;
  }

  const source = readFileSync(filePath, "utf8");
  const matches = source.match(/\.loose\(\)/g);
  if (!matches) {
    continue;
  }

  const updated = source.replaceAll(".loose()", ".passthrough()");
  if (updated === source) {
    continue;
  }

  writeFileSync(filePath, updated, "utf8");
  patchedFiles += 1;
  patchedCalls += matches.length;
}

console.log(
  `[postinstall] normalized ${patchedCalls} @elizaos/core loose() call(s) across ${patchedFiles} bundle(s)`,
);
