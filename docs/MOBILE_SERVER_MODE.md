# Mobile App - Server Mode Configuration

## Overview

Your Eliza Cloud mobile app is configured to run in **server mode**, which means the mobile app loads content from your Next.js application running on a server (local dev server or deployed production URL).

This approach is used because:
- ✅ Your app has many API routes that can't be statically exported
- ✅ Full app functionality works without modifications
- ✅ Easier development workflow
- ✅ Real-time updates during development

## Quick Start

### For Development (iOS)

1. **Start your Next.js dev server** (in one terminal):
   ```bash
   bun run dev
   ```
   
   This starts the server at `http://localhost:3000`

2. **Open Xcode** (in another terminal or just run once):
   ```bash
   bun run mobile:open:ios
   ```

3. **Run in Xcode**:
   - Select a simulator (e.g., iPhone 15)
   - Click the Run button (▶) or press `Cmd + R`
   - The app will load from your local dev server

### For Development (Android)

1. **Start your Next.js dev server**:
   ```bash
   bun run dev
   ```

2. **Open Android Studio**:
   ```bash
   bun run mobile:open:android
   ```

3. **Update server URL for Android**:
   - Android emulator uses `10.0.2.2` to access localhost
   - Edit `capacitor.config.ts` and change:
     ```typescript
     url: 'http://10.0.2.2:3000', // For Android emulator
     ```

4. **Run in Android Studio**:
   - Click the Run button
   - Select an emulator or device

## Configuration

### Current Setup (`capacitor.config.ts`)

```typescript
server: {
  url: 'http://localhost:3000', // Loads from local dev server
  cleartext: true, // Allows HTTP (for development)
}
```

### For Production Builds

Before building for App Store or Play Store, update `capacitor.config.ts`:

```typescript
server: {
  url: 'https://your-app.vercel.app', // Your production URL
  cleartext: false, // HTTPS only
}
```

Then sync and build:
```bash
bun run mobile:sync
```

## Platform-Specific URLs

### iOS Simulator
- `http://localhost:3000` ✅ Works directly

### Android Emulator
- `http://localhost:3000` ❌ Won't work
- `http://10.0.2.2:3000` ✅ Use this instead

### Physical Devices (iOS & Android)
- `http://localhost:3000` ❌ Won't work
- `http://YOUR_COMPUTER_IP:3000` ✅ Use your local network IP
- Example: `http://192.168.1.100:3000`

To find your IP:
```bash
# macOS
ipconfig getifaddr en0

# Or use
ifconfig | grep "inet "
```

## Development Workflow

1. Make changes to your Next.js code
2. Dev server automatically reloads (hot reload)
3. Pull to refresh in the mobile app or restart the app
4. Changes appear immediately

## Network Configuration

### Allow Local Network Access

#### iOS (Info.plist)
Already configured in the Capacitor iOS project.

#### Android (network_security_config.xml)
May need to add network security config for localhost:

```xml
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">10.0.2.2</domain>
    <domain includeSubdomains="true">localhost</domain>
  </domain-config>
</network-security-config>
```

## Advantages of Server Mode

1. **Full API Support**: All your API routes work without modification
2. **Server Actions**: Next.js server actions work perfectly
3. **Real-time Updates**: Changes reflect immediately during development
4. **No Build Step**: No need to rebuild for every change
5. **Production Ready**: Just point to your production URL

## Disadvantages

1. **Requires Internet**: Mobile app needs network connection
2. **Server Dependency**: Backend must be running/deployed
3. **Not Fully Native**: Can't work 100% offline

## Switching to Static Export (Advanced)

If you want a fully offline mobile app, you'll need to:

1. Separate frontend and backend code
2. Build frontend as static site (`output: 'export'`)
3. Configure frontend to call separate backend API
4. Remove or externalize all API routes

This is a significant refactoring and not recommended unless offline functionality is critical.

## Troubleshooting

### App shows blank white screen

**Check:**
1. Is dev server running? (`bun run dev`)
2. Is the URL correct in `capacitor.config.ts`?
3. Can you access the URL in a browser?

### "Could not connect to server" error

**Check:**
1. Server is running
2. Firewall isn't blocking connections
3. URL is correct for your platform (localhost vs 10.0.2.2 vs IP)

### App works on simulator but not on device

**Solution:**
Use your computer's local network IP instead of localhost:
```typescript
url: 'http://192.168.1.100:3000', // Your actual IP
```

### CORS errors

If you see CORS errors, your Next.js app may need CORS configuration for mobile requests. Add this to a middleware or API route:

```typescript
headers: {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
```

## Production Deployment Checklist

- [ ] Update `server.url` to production URL (e.g., `https://your-app.vercel.app`)
- [ ] Set `server.cleartext` to `false`
- [ ] Test on physical devices
- [ ] Ensure production server is accessible
- [ ] Configure app signing (iOS & Android)
- [ ] Build release versions
- [ ] Submit to App Store / Play Store

## References

- [Capacitor Live Reload Docs](https://capacitorjs.com/docs/guides/live-reload)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

---

**Current Status**: Your iOS project is open in Xcode and ready to run! Make sure your dev server is running (`bun run dev`) before clicking Run in Xcode.

