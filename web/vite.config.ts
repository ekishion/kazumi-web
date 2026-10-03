import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiProxy = {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    proxy: apiProxy,
  },
  // 后端为纯 API 服务，preview 同样需要将 /api 反代到 Go 服务
  preview: {
    port: 3000,
    proxy: apiProxy,
  },
})
