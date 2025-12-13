/**
 * k6 TypeScript Bundler Configuration
 *
 * Uses esbuild to bundle TypeScript files for k6.
 * Run: node bundle.js <scenario>
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const scenario = process.argv[2] || "smoke";
const inputFile = path.join(__dirname, "scenarios", `${scenario}.ts`);
const outputFile = path.join(__dirname, "dist", `${scenario}.js`);

// Ensure dist directory exists
if (!fs.existsSync(path.join(__dirname, "dist"))) {
  fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
}

esbuild
  .build({
    entryPoints: [inputFile],
    bundle: true,
    outfile: outputFile,
    format: "esm",
    platform: "neutral",
    target: "es2020",
    external: [
      "k6",
      "k6/*",
      "https://jslib.k6.io/*",
    ],
    minify: false,
    sourcemap: false,
  })
  .then(() => {
    console.log(`✓ Bundled ${scenario}.ts -> dist/${scenario}.js`);
  })
  .catch((error) => {
    console.error(`✗ Bundle failed:`, error);
    process.exit(1);
  });

