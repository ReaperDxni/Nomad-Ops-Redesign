import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The Go server embeds ./build as wwwroot (see Dockerfile), so keep that outDir.
export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'build', emptyOutDir: true },
  server: {
    port: 3000,
    proxy: { '/api': 'http://127.0.0.1:8090' },
  },
})
