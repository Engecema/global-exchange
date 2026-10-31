import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { pixApiDevPlugin } from './api/devApiPlugin';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pixApiDevPlugin()],
  define: {
    'import.meta.env.VITE_GX_SUPABASE_URL': JSON.stringify(process.env.GX_SUPABASE_URL || process.env.VITE_GX_SUPABASE_URL || 'https://odbbtgkxgiqlfhcepwuj.supabase.co'),
    'import.meta.env.VITE_GX_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(process.env.GX_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_GX_SUPABASE_PUBLISHABLE_KEY || process.env.GX_SUPABASE_ANON_KEY || 'sb_publishable_22fzrMlPYyCnPUceg1b04g_ChyHEv97'),
  },
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
