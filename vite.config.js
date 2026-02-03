import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_PORT) || 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL, // e.g. http://localhost:3030
          changeOrigin: true,
          // /api/users -> /api/backoffice/users
          rewrite: (path) => path.replace(/^\/api(\/|$)/, '/api/backoffice$1'),
        },
      },
    },
  }
})
