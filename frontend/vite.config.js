import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PORT = process.env.PORT || 5173;
const HOST = process.env.HOST || '0.0.0.0';
const BACKEND_URL = process.env.BACKEND_URL || process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: HOST,
    port: Number(PORT),
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/socket.io': {
        target: BACKEND_URL,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['framer-motion', 'lucide-react'],
          charts: ['recharts'],
        },
      },
    },
  },
});
