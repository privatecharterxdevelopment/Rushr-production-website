import type { CapacitorConfig } from '@capacitor/cli';

// Production - Load from new Vercel deployment
const config: CapacitorConfig = {
  appId: 'com.userushr.app',
  appName: 'Rushr',
  webDir: 'out',
  server: {
    url: 'http://172.16.1.114:3000',
    cleartext: true
  },
  ios: {
    contentInset: 'never',
    scheme: 'Rushr',
    backgroundColor: '#ffffff'
  }
};

export default config;
