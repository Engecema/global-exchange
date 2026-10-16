import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { pixApiDevPlugin } from './api/devApiPlugin';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pixApiDevPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
});
