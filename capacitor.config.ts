import type { CapacitorConfig } from '@capacitor/cli';

// Mobile app configuration for Eliza Cloud
// The mobile app loads from your deployed Next.js application
// This allows the mobile app to use all API routes and server features

const config: CapacitorConfig = {
  appId: 'com.eliza.cloud',
  appName: 'Eliza Cloud',
  server: {
    // Point to your deployed application
    // Change this to your production URL before building for release
    url: 'http://localhost:3000', // For development with `bun run dev`
    cleartext: true, // Allow HTTP for local development
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;

