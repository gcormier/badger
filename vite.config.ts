import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works at https://<user>.github.io/<repo>/ or a custom domain
  base: './',
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['manifold-3d'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
