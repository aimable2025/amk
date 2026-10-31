import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cd.etsamani.app',
  appName: 'Ets AMANI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
