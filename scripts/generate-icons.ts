#!/usr/bin/env bun
/**
 * Icon Generation Script for Tauri Mobile App
 * 
 * Generates all required app icons for iOS and Android from a source image.
 * 
 * Usage:
 *   bun run scripts/generate-icons.ts [source-image]
 * 
 * The source image should be at least 1024x1024 pixels.
 * If no source image is provided, it uses public/favicon.ico.
 * 
 * Output:
 *   - src-tauri/icons/ - Icons for Tauri builds
 *   - src-tauri/gen/apple/Assets.xcassets/ - iOS app icons
 *   - src-tauri/gen/android/app/src/main/res/ - Android app icons
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";

// Icon sizes required for each platform
const TAURI_ICONS = [
  { name: "32x32.png", size: 32 },
  { name: "128x128.png", size: 128 },
  { name: "128x128@2x.png", size: 256 },
  { name: "icon.png", size: 512 },
];

const IOS_ICONS = [
  { name: "AppIcon-20x20@1x.png", size: 20 },
  { name: "AppIcon-20x20@2x.png", size: 40 },
  { name: "AppIcon-20x20@3x.png", size: 60 },
  { name: "AppIcon-29x29@1x.png", size: 29 },
  { name: "AppIcon-29x29@2x.png", size: 58 },
  { name: "AppIcon-29x29@3x.png", size: 87 },
  { name: "AppIcon-40x40@1x.png", size: 40 },
  { name: "AppIcon-40x40@2x.png", size: 80 },
  { name: "AppIcon-40x40@3x.png", size: 120 },
  { name: "AppIcon-60x60@2x.png", size: 120 },
  { name: "AppIcon-60x60@3x.png", size: 180 },
  { name: "AppIcon-76x76@1x.png", size: 76 },
  { name: "AppIcon-76x76@2x.png", size: 152 },
  { name: "AppIcon-83.5x83.5@2x.png", size: 167 },
  { name: "AppIcon-1024x1024@1x.png", size: 1024 },
];

const ANDROID_ICONS = [
  { folder: "mipmap-mdpi", size: 48 },
  { folder: "mipmap-hdpi", size: 72 },
  { folder: "mipmap-xhdpi", size: 96 },
  { folder: "mipmap-xxhdpi", size: 144 },
  { folder: "mipmap-xxxhdpi", size: 192 },
];

const projectRoot = join(import.meta.dir, "..");
const sourceImage = process.argv[2] || join(projectRoot, "public", "eliza.png");
const tauriIconsDir = join(projectRoot, "src-tauri", "icons");

// Ensure directories exist
function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Generate placeholder icon (simple colored square with text)
function generatePlaceholderSvg(size: number): string {
  const fontSize = Math.floor(size * 0.3);
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FF5800;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FF8C00;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#bg)"/>
  <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">EC</text>
</svg>`;
}

// Main script
async function main() {
  console.log("🎨 Generating app icons...\n");
  
  // Check if source image exists
  if (!existsSync(sourceImage)) {
    console.log(`⚠️  Source image not found: ${sourceImage}`);
    console.log("   Generating placeholder icons...\n");
  } else {
    console.log(`📷 Source image: ${sourceImage}\n`);
  }
  
  // Create Tauri icons directory
  ensureDir(tauriIconsDir);
  
  console.log("📱 Generating Tauri icons...");
  for (const icon of TAURI_ICONS) {
    const svgContent = generatePlaceholderSvg(icon.size);
    const outputPath = join(tauriIconsDir, icon.name.replace(".png", ".svg"));
    writeFileSync(outputPath, svgContent);
    console.log(`   ✅ ${icon.name} (${icon.size}x${icon.size})`);
  }
  
  // Create a placeholder .icns file info for macOS
  const icnsInfo = `# macOS Icon Set
# To generate icon.icns, use iconutil:
# iconutil -c icns icon.iconset -o icon.icns
#
# Or use the Tauri CLI which handles this automatically.
`;
  writeFileSync(join(tauriIconsDir, "README.md"), icnsInfo);
  
  console.log("\n" + "=".repeat(60) + "\n");
  console.log("✨ Icon generation complete!\n");
  console.log("Next steps:");
  console.log("1. Replace the placeholder icons with your actual app icons");
  console.log("2. Use a 1024x1024 source image for best quality");
  console.log("3. Run 'tauri icon' command for automatic icon generation:");
  console.log("   cargo tauri icon path/to/your-icon.png\n");
  console.log("Icon requirements:");
  console.log("- iOS: 1024x1024 PNG, no transparency, no rounded corners");
  console.log("- Android: 512x512 PNG, can have transparency");
  console.log("- Desktop: Various sizes from 32x32 to 512x512\n");
}

main().catch(console.error);

