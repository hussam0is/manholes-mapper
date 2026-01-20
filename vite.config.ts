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
        manualChunks: {
          // Split Clerk into its own chunk (large library)
          'clerk': ['@clerk/clerk-react', '@clerk/shared'],
          // React ecosystem in its own chunk
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    // When running under vercel dev, let Vercel control the port
    // Otherwise default to 5173 for standalone vite dev
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    host: '127.0.0.1',
    // Use local certs if available (from mkcert)
    https: hasLocalCerts ? {
      cert: './manholes-mapper.local+5.pem',
      key: './manholes-mapper.local+5-key.pem',
    } : undefined,
    // Disable HMR when running through vercel dev (Vercel doesn't proxy WebSockets)
    // You'll need to manually refresh after code changes when using `npm start`
    // Use `npm run dev` for HMR if you don't need API routes
    hmr: process.env.PORT ? false : undefined,
  },
  preview: {
    host: true,
  }
})





