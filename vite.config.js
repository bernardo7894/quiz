import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Set base to '/quiz/' for GitHub Pages (matches the repository name).
  // Change to '/' if you are using a custom domain or deploying to the root.
  base: '/quiz/',
  plugins: [react()],
  optimizeDeps: {
    // Transformers.js ships native WASM/ESM modules; exclude from Vite's
    // pre-bundling so they are served as-is.
    exclude: ['@huggingface/transformers'],
  },
  worker: {
    format: 'es',
  },
})

