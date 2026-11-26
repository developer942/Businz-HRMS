import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    modulePreload: {
      resolveDependencies(_filename, deps) {
        // Prevent heavy on-demand libraries from being preloaded into initial page startup
        return deps.filter(dep => 
          !dep.includes('vendor-pdf') && 
          !dep.includes('vendor-xlsx') && 
          !dep.includes('vendor-map') && 
          !dep.includes('vendor-ocr')
        );
      }
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('\\react\\')) return 'vendor-react';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('canvg')) return 'vendor-pdf';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('leaflet')) return 'vendor-map';
          if (id.includes('tesseract')) return 'vendor-ocr';
          if (id.includes('libphonenumber-js')) return 'vendor-phone';
          if (id.includes('@radix-ui') || id.includes('radix-ui')) return 'vendor-radix';
          return 'vendor-misc';
        },
      },
    },
  },
})
