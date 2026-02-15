import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          plotly: ['plotly.js-basic-dist-min'],
          react: ['react', 'react-dom'],
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
