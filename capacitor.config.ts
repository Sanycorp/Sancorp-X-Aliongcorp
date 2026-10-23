import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sanayacorp.aegisowner',
  appName: 'Aegis Owner',
  webDir: 'dist',
  server: {
    // The APK is offline by design: bundle origin only, no remote navigation.
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: false,
    allowNavigation: [],
  },
  android: {
    // The owner build opens on the control panel, so the window colour matches
    // the panel rather than the storefront.
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
      dialogTitle: 'Bagikan hasil Aegis Sound Lab',
    },
    SplashScreen: {
      // One branded frame, then hand the screen to the app. Never longer: the
      // panel is already painted by the time this fades.
      launchShowDuration: 700,
      launchAutoHide: true,
      launchFadeOutDuration: 220,
      backgroundColor: '#05070b',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
