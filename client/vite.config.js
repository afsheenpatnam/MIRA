import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API runs separately; the browser only ever talks to /api on this origin.
    proxy: { '/api': 'http://localhost:5000' },
  },
});
