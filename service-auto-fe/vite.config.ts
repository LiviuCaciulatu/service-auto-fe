import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  server: {
    proxy: {
      '/clients': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/driverLicenses': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/files': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
