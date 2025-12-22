#!/usr/bin/env tsx

import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { uploadToBlob } from "@/lib/blob";

async function main() {
  console.log("📤 Uploading email assets to Vercel Blob...\n");

  const cloudLogoPath = path.join(
    process.cwd(),
    "public/assets/email/cloudlogo.svg",
  );
  const poweredByPath = path.join(
    process.cwd(),
    "public/assets/email/poweredby.svg",
  );

  const cloudLogoSvg = fs.readFileSync(cloudLogoPath, "utf-8");
  const poweredBySvg = fs.readFileSync(poweredByPath, "utf-8");

  console.log("Uploading cloudlogo.svg...");
  const cloudLogoResult = await uploadToBlob(Buffer.from(cloudLogoSvg), {
    filename: "cloudlogo.svg",
    contentType: "image/svg+xml",
    folder: "email-assets",
  });
  console.log(`✅ Cloud Logo: ${cloudLogoResult.url}\n`);

  console.log("Uploading poweredby.svg...");
  const poweredByResult = await uploadToBlob(Buffer.from(poweredBySvg), {
    filename: "poweredby.svg",
    contentType: "image/svg+xml",
    folder: "email-assets",
  });
  console.log(`✅ Powered By: ${poweredByResult.url}\n`);

  console.log("🎉 Done! Use these URLs in your email template:");
  console.log(`Cloud Logo URL: ${cloudLogoResult.url}`);
  console.log(`Powered By URL: ${poweredByResult.url}`);
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
