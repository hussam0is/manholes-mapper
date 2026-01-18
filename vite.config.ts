import { defineConfig } from 'vite'
import { existsSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const hasLocalCerts = existsSync('./manholes-mapper.local+5.pem') && existsSync('./manholes-mapper.local+5-key.pem')

export default defineConfig({
  plugins: [
    react(),
    // Use basicSsl if local custom certs are not present to ensure HTTPS on IP access
    !hasLocalCerts ? basicSsl() : []
  ],
  // Force absolute base in development for Vercel proxy, 
  // and relative base for the final production PWA build.
  base: '/', 
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'styles.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    https: false,
    hmr: {
      protocol: 'ws',
    }
  },
  preview: {
    host: true,
    https: true
  }
})





