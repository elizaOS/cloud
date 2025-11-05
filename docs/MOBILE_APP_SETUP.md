# Eliza Cloud Mobile App Setup Guide

This guide covers the setup and development of native iOS and Android mobile applications for Eliza Cloud using Capacitor.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Building for Mobile](#building-for-mobile)
- [Platform-Specific Setup](#platform-specific-setup)
  - [Android Setup](#android-setup)
  - [iOS Setup](#ios-setup)
- [Development Workflow](#development-workflow)
- [Generating Production Builds](#generating-production-builds)
- [Troubleshooting](#troubleshooting)

## Overview

Eliza Cloud uses [Capacitor](https://capacitorjs.com/) to convert the Next.js web application into native iOS and Android apps. Capacitor wraps the web app in a native WebView while providing access to native device features through plugins.

### Key Features

- ✅ Native iOS and Android apps from a single codebase
- ✅ Access to native device features (camera, storage, etc.)
- ✅ Automatic synchronization between web and native code
- ✅ Hot reload during development
- ✅ App Store and Play Store ready builds

## Prerequisites

Before you begin, ensure you have the following installed:

### For Both Platforms

- **Node.js** (v18 or higher)
- **Bun** (package manager - already configured in this project)
- **Capacitor CLI** (installed as project dependency)

### For Android Development

- **Android Studio** (Latest version)
  - Download from: https://developer.android.com/studio
- **Android SDK** (API Level 33 or higher)
- **Java Development Kit (JDK)** 17 or higher
- **Gradle** (comes with Android Studio)

### For iOS Development (macOS only)

- **Xcode** (14.0 or higher)
  - Download from Mac App Store
- **CocoaPods**
  ```bash
  sudo gem install cocoapods
  ```
- **Xcode Command Line Tools**
  ```bash
  xcode-select --install
  ```
- **Apple Developer Account** (for device testing and App Store deployment)

## Initial Setup

The Capacitor configuration has already been set up in this project. You can verify it by checking:

1. **Capacitor Config** (`capacitor.config.ts`):
   ```typescript
   {
     appId: 'com.eliza.cloud',
     appName: 'Eliza Cloud',
     webDir: 'out',
     bundledWebRuntime: false
   }
   ```

2. **Next.js Config** (`next.config.ts`):
   - Static export enabled when `NEXT_PUBLIC_BUILD_MODE=capacitor`
   - Image optimization disabled for mobile builds

3. **Package Scripts**:
   All mobile-related scripts are prefixed with `mobile:`

## Building for Mobile

### Step 1: Add Native Platforms

First-time setup requires adding the iOS and Android platforms:

```bash
# Add Android platform
bun run mobile:add:android

# Add iOS platform (macOS only)
bun run mobile:add:ios
```

This creates `android/` and `ios/` directories with the native project files.

### Step 2: Build the Web App

Build the Next.js application in static export mode:

```bash
bun run mobile:build
```

This command:
1. Builds the Next.js app with static export enabled
2. Outputs to the `out/` directory
3. Syncs the web assets to native platforms

### Step 3: Sync Changes

After making changes to your web code, sync them to native platforms:

```bash
bun run mobile:sync
```

Or, to just copy web assets without syncing native dependencies:

```bash
bun run mobile:copy
```

## Platform-Specific Setup

### Android Setup

#### 1. Open Android Project

```bash
bun run mobile:open:android
```

This opens the project in Android Studio.

#### 2. Configure Build Settings

In Android Studio:

1. **Check SDK Versions**:
   - Open `android/app/build.gradle`
   - Ensure `compileSdk` and `targetSdk` are set to 33 or higher

2. **Set Package Name**:
   - Package name: `com.eliza.cloud` (already configured)

3. **Configure App Icon and Splash Screen**:
   - Place icons in `android/app/src/main/res/mipmap-*` directories
   - Configure splash screen in `android/app/src/main/res/values/styles.xml`

#### 3. Run on Android Device/Emulator

In Android Studio:
- Click the "Run" button (green play icon)
- Select a device or emulator

Or use the command line:

```bash
bun run mobile:run:android
```

#### 4. Generate Signed APK/AAB for Production

##### Create Keystore

```bash
cd android
keytool -genkey -v -keystore eliza-cloud-release.keystore \
  -alias eliza-cloud \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

You'll be prompted to enter:
- Keystore password (remember this!)
- Key password (remember this!)
- Your details (name, organization, etc.)

**⚠️ IMPORTANT**: Store the keystore file and passwords securely. You'll need them for all future app updates.

##### Configure Signing in Android Studio

1. Open `android/app/build.gradle`
2. Add signing configuration:

```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file('eliza-cloud-release.keystore')
            storePassword 'YOUR_KEYSTORE_PASSWORD'
            keyAlias 'eliza-cloud'
            keyPassword 'YOUR_KEY_PASSWORD'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            ...
        }
    }
}
```

##### Build Release APK

```bash
cd android
./gradlew assembleRelease
```

APK location: `android/app/build/outputs/apk/release/app-release.apk`

##### Build Release AAB (for Play Store)

```bash
cd android
./gradlew bundleRelease
```

AAB location: `android/app/build/outputs/bundle/release/app-release.aab`

### iOS Setup

#### 1. Open iOS Project

```bash
bun run mobile:open:ios
```

This opens the project in Xcode.

#### 2. Configure Project Settings

In Xcode:

1. **Select the project** in the navigator (top item)
2. **General Tab**:
   - Set Display Name: "Eliza Cloud"
   - Set Bundle Identifier: `com.eliza.cloud`
   - Select Team (requires Apple Developer account)

3. **Signing & Capabilities**:
   - Enable "Automatically manage signing"
   - Select your Development Team

4. **Info Tab**:
   - Configure app permissions (camera, location, etc.)

#### 3. Run on iOS Simulator

1. Select a simulator from the device menu (e.g., "iPhone 15")
2. Click the "Run" button (play icon) or press `Cmd + R`

Or use the command line:

```bash
bun run mobile:run:ios
```

#### 4. Run on Physical iOS Device

1. Connect your iPhone/iPad via USB
2. Trust the device on both ends
3. Select the device in Xcode's device menu
4. Click "Run"

**Note**: You need an Apple Developer account ($99/year) to run on physical devices and publish to the App Store.

#### 5. Generate Production Build for App Store

1. In Xcode, select **Product > Archive**
2. Wait for the archive to complete
3. In the Archives window, select **Distribute App**
4. Choose distribution method:
   - **App Store Connect** (for App Store)
   - **Ad Hoc** (for beta testing)
   - **Enterprise** (for internal distribution)
5. Follow the wizard to upload to App Store Connect

## Development Workflow

### Recommended Development Process

1. **Make changes to your Next.js app** (components, pages, etc.)

2. **Test in web browser first**:
   ```bash
   bun run dev
   ```

3. **Build and sync to mobile**:
   ```bash
   bun run mobile:build
   ```

4. **Test on mobile**:
   ```bash
   # Android
   bun run mobile:run:android
   
   # iOS
   bun run mobile:run:ios
   ```

### Live Reload (Advanced)

For faster development, you can configure Capacitor to load from your local dev server:

1. Update `capacitor.config.ts`:
   ```typescript
   const config: CapacitorConfig = {
     // ... existing config
     server: {
       url: 'http://192.168.1.X:3000', // Your local IP
       cleartext: true
     }
   };
   ```

2. Run dev server:
   ```bash
   bun run dev
   ```

3. Sync and run mobile app - it will now load from your dev server with hot reload!

**⚠️ Remember to remove the `server` config before production builds!**

## Generating Production Builds

### Pre-Release Checklist

- [ ] Update version in `package.json`
- [ ] Update version in native projects:
  - Android: `android/app/build.gradle` (versionCode and versionName)
  - iOS: Xcode project settings (Version and Build)
- [ ] Test on physical devices
- [ ] Remove any debug/dev configurations
- [ ] Ensure all API endpoints point to production
- [ ] Test offline functionality
- [ ] Verify app icons and splash screens
- [ ] Check app permissions

### Building for Production

```bash
# 1. Build the web app
bun run mobile:build

# 2. Follow platform-specific steps above for:
#    - Android: Generate signed APK/AAB
#    - iOS: Archive and upload to App Store Connect
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run mobile:init` | Initialize Capacitor (already done) |
| `bun run mobile:build` | Build web app and sync to mobile |
| `bun run mobile:sync` | Sync web assets and update native dependencies |
| `bun run mobile:copy` | Copy web assets only |
| `bun run mobile:add:android` | Add Android platform |
| `bun run mobile:add:ios` | Add iOS platform |
| `bun run mobile:open:android` | Open Android project in Android Studio |
| `bun run mobile:open:ios` | Open iOS project in Xcode |
| `bun run mobile:run:android` | Run on Android device/emulator |
| `bun run mobile:run:ios` | Run on iOS device/simulator |

## Troubleshooting

### Common Issues

#### Android Build Fails

**Problem**: Gradle build errors

**Solution**:
```bash
cd android
./gradlew clean
./gradlew build
```

#### iOS Build Fails

**Problem**: CocoaPods dependencies issues

**Solution**:
```bash
cd ios/App
pod deintegrate
pod install
```

#### Static Export Errors

**Problem**: Next.js features not compatible with static export

**Solution**:
- Avoid server-side features in mobile builds
- Use client-side data fetching
- Disable image optimization (`unoptimized: true`)
- Avoid dynamic routes that can't be pre-rendered

#### App Shows Blank Screen

**Problem**: Web assets not synced

**Solution**:
```bash
bun run mobile:build
```

### Getting Help

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Next.js Static Export Guide](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [Android Studio Documentation](https://developer.android.com/studio)
- [Xcode Documentation](https://developer.apple.com/xcode/)

## Best Practices

1. **Always test on both platforms** - iOS and Android may behave differently
2. **Use environment variables** to switch between web and mobile-specific code
3. **Optimize images** for mobile to reduce app size
4. **Handle offline scenarios** gracefully
5. **Test on various screen sizes** and device types
6. **Use native plugins** sparingly to keep the app lightweight
7. **Keep Capacitor updated** for the latest features and bug fixes

## Next Steps

After setting up mobile apps:

1. Configure push notifications (if needed)
2. Add app icons and splash screens
3. Set up deep linking
4. Configure app permissions
5. Submit to App Store and Play Store

## References

- [Capacitor Integration with Next.js Guide](https://hamzaaliuddin.medium.com/integrating-capacitor-with-next-js-a-step-by-step-guide-685c5030710c)
- [Official Capacitor Docs](https://capacitorjs.com/docs)
- [Next.js Static Export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)

