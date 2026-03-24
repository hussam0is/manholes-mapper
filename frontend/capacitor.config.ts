import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.geopoint.manholemapper',
  appName: 'Manhole Mapper',
  webDir: 'dist',
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
    },
  },
  plugins: {
    // Bluetooth and TCP plugins will be configured here when installed
  },
  server: {
    url: 'https://manholes-mapper.vercel.app',
    cleartext: true,
    androidScheme: 'https',
  },
};

export default config;
