import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // WXT React module for JSX transform
  modules: ['@wxt-dev/module-react'],

  // Vite config: Tailwind v4 via its official Vite plugin
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }),

  // Path aliases for imports (mirrors vite alias)
  alias: {
    '@': '/src',
  },

  manifest: {
    name: 'Aquo',
    description: 'Engineering-grade data channel for the web. Instant extraction, privacy-first — local processing only.',
    version: '1.0.0',

    // MV3 permissions — sidePanel is auto-added by WXT when sidepanel entrypoint exists
    permissions: [
      'activeTab',
      'scripting',
      'storage',
      'alarms',
    ],

    // Required for Lemon Squeezy License API calls (CORS-enabled public endpoint)
    host_permissions: [
      'https://api.lemonsqueezy.com/*',
      '*://*/*',
    ],

    // Empty action object required when using sidePanel (no popup UI)
    action: {},

    icons: {
      16: 'icon-16.svg',
      32: 'icon-32.svg',
      48: 'icon-48.svg',
      128: 'icon-128.svg',
    },
  },
});
