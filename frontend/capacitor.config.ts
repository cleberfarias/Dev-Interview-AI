import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cleberfarias.devinterviewai',
  appName: 'Dev Interview AI',
  webDir: 'dist',
  server: {
    url: 'https://dev-interview-ai.web.app',
    cleartext: false,
    androidScheme: 'https',
  },
};

export default config;
