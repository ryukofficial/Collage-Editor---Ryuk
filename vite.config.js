import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173 },
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 0,
    target: 'es2020',
    rollupOptions: {
      output: { manualChunks: { vendor: ['react', 'react-dom', 'zustand'] } },
    },
  },
  worker: { format: 'es' },
})
