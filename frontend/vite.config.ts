import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { fs: { allow: ['..'] } },
  plugins: [react(), tailwindcss()],
})
