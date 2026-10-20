import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eltzy.app',
  appName: 'EL TZY AEGIS-M',
  webDir: 'dist',
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
      dialogTitle: 'Bagikan hasil AEGIS-M',
    },
  },
};

export default config;
