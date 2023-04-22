import { fileURLToPath, URL } from 'node:url';

import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  envDir: resolve(__dirname, './env'),
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
          @import "@/assets/_normalize.scss";
          @import "@/assets/_global.scss";
          @import "@/assets/_variables.scss";
          @import "@/assets/_mixins.scss";
        `,
      },
    },
  },
});
