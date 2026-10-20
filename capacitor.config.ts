import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eltzy.app',
  appName: 'Aegis Music',
  webDir: 'dist',
  server: {
    // The APK is offline by design: bundle origin only, no remote navigation.
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: false,
    allowNavigation: [],
  },
  android: {
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#e8ecf3',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#e8ecf3',
  },
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#e8ecf3',
      overlaysWebView: false,
    },
    Share: {
      dialogTitle: 'Bagikan hasil Aegis Music',
    },
  },
};

export default config;
