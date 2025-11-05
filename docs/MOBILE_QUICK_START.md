# Mobile App Quick Start Guide

Get your Eliza Cloud mobile apps running in minutes!

## 🚀 Quick Start (First Time Setup)

### Step 1: Add Platforms

```bash
# Add Android
bun run mobile:add:android

# Add iOS (macOS only)
bun run mobile:add:ios
```

### Step 2: Build for Mobile

```bash
bun run mobile:build
```

### Step 3: Open in Native IDE

**For Android:**
```bash
bun run mobile:open:android
```
Then click the "Run" button in Android Studio.

**For iOS:**
```bash
bun run mobile:open:ios
```
Then click the "Run" button in Xcode (or press Cmd + R).

## 🔄 After Making Code Changes

```bash
# Rebuild and sync
bun run mobile:build

# Then run again in Android Studio or Xcode
```

## 📱 Common Commands

| What do you want to do? | Command |
|------------------------|---------|
| Build for mobile | `bun run mobile:build` |
| Sync changes | `bun run mobile:sync` |
| Open Android Studio | `bun run mobile:open:android` |
| Open Xcode | `bun run mobile:open:ios` |
| Run on Android | `bun run mobile:run:android` |
| Run on iOS | `bun run mobile:run:ios` |

## ⚙️ Prerequisites

**For Android:**
- Install [Android Studio](https://developer.android.com/studio)
- Install JDK 17+

**For iOS (macOS only):**
- Install [Xcode](https://apps.apple.com/app/xcode/id497799835)
- Run: `sudo gem install cocoapods`

## 📖 Full Documentation

For detailed setup, production builds, and troubleshooting, see [MOBILE_APP_SETUP.md](./MOBILE_APP_SETUP.md).

## 🎯 Quick Tips

1. **Always build first**: Run `bun run mobile:build` before opening native IDEs
2. **Test web first**: Run `bun run dev` to test in browser before mobile
3. **Keep platforms synced**: Run `bun run mobile:sync` after web changes
4. **Check static export**: Some Next.js features don't work in static export mode

## 🐛 Quick Fixes

**Blank screen?**
```bash
bun run mobile:build
```

**Android build fails?**
```bash
cd android && ./gradlew clean && ./gradlew build
```

**iOS build fails?**
```bash
cd ios/App && pod deintegrate && pod install
```

---

Happy mobile development! 📱✨

