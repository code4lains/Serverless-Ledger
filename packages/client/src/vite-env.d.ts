/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  turnstile?: {
    render: (
      container: string | HTMLElement,
      options: {
        sitekey: string;
        theme?: 'light' | 'dark' | 'auto';
        size?: 'normal' | 'compact' | 'flexible';
        callback?: (token: string) => void;
        'expired-callback'?: () => void;
        'error-callback'?: (errorCode?: string | number) => void;
        'unsupported-callback'?: () => void;
        retry?: 'auto' | 'never';
        language?: string;
        action?: string;
      }
    ) => string;
    reset: (widgetId?: string) => void;
    remove: (widgetId: string) => void;
    getResponse?: (widgetId?: string) => string | undefined;
  };
}
