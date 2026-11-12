import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local only: the API dev server (npm run dev -w api) stands in for API Gateway.
    proxy: { '/api': 'http://localhost:3001' },
  },
})
