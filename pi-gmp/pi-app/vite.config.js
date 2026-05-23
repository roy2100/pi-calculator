import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  publicDir: path.resolve(__dirname, '../www'),
  plugins: [react()],
})
