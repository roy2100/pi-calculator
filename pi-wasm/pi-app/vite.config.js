import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'wasm-mime',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm')
          }
          next()
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@pkg': path.resolve(__dirname, '../pkg'),
    },
  },
  optimizeDeps: {
    exclude: ['@pkg'],
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
})
