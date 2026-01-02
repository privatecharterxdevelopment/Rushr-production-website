import type { CapacitorConfig } from '@capacitor/cli';

// Production - Load from new Vercel deployment
const config: CapacitorConfig = {
  appId: 'com.userushr.app',
  appName: 'Rushr',
  webDir: 'out',
  server: {
    url: 'https://staging-rushr-five.vercel.app',
    cleartext: false
  },
  ios: {
    contentInset: 'never',
    scheme: 'Rushr',
    backgroundColor: '#ffffff'
  }
};

export default config;
