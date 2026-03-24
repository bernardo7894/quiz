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
  server: {
    // Enable Cross-Origin Isolation headers in dev so that SharedArrayBuffer
    // (required by @huggingface/transformers threaded WASM) works locally
    // without relying on the COI service worker.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})

