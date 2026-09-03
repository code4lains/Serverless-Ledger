import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ledger.serverless',
  appName: '账盾',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    // ledger:// deep link 由原生 AndroidManifest (ledger scheme) 处理，
    // 此处放行以便 Capacitor WebView / appUrlOpen 能接收 widget 点击跳转。
    allowNavigation: ['ledger://*'],
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#F7F6F2',
      androidSplashResourceName: 'splash',
    },
  },
};

export default config;
