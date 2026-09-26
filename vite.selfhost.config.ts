import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envDir: false,
  build: { outDir: 'dist/selfhost/client', emptyOutDir: true, cssCodeSplit: true, cssMinify: 'lightningcss' },
});
