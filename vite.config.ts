import { defineConfig } from 'vite'
import { existsSync } from 'node:fs'
import react from '@vitejs/plugin-react'

const hasLocalCerts = existsSync('./manholes-mapper.local+5.pem') && existsSync('./manholes-mapper.local+5-key.pem')

export default defineConfig({
  plugins: [
    react(),
  ],
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
    // Use local certs if available (from mkcert)
    https: hasLocalCerts ? {
      cert: './manholes-mapper.local+5.pem',
      key: './manholes-mapper.local+5-key.pem',
    } : undefined,
  },
  preview: {
    host: true,
  }
})





