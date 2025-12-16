import type { CapacitorConfig } from '@capacitor/cli';

// For development: set to true to load from localhost
// For TestFlight/App Store: set to false to load from production
const USE_LOCAL_DEV = false; // Set to false for TestFlight/Production

const config: CapacitorConfig = {
  appId: 'com.userushr.app',
  appName: 'Rushr',
  webDir: 'out',
  server: USE_LOCAL_DEV ? {
    // Local development - loads from dev server
    url: 'http://172.20.10.3:3001',
    cleartext: true
  } : {
    // Production - loads from staging (no early access redirect)
    url: 'https://staging-rushr.vercel.app',
    cleartext: false
  },
  ios: {
    contentInset: 'never',
    scheme: 'Rushr',
    backgroundColor: '#ffffff'
  }
};

export default config;
