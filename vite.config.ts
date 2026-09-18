import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    // Expose on the LAN so the game can be opened on a real phone — mobile
    // framing and touch input cannot be verified in a desktop emulator alone.
    host: true,
  },

  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Phaser is already split out by the dynamic import in PhaserGame.tsx;
        // naming the chunk keeps it stable and cacheable across releases.
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          return undefined;
        },
      },
    },
    // Phaser alone is ~1.3MB. It is a lazy chunk, so the default 500kB warning
    // is noise rather than signal here.
    chunkSizeWarningLimit: 1600,
  },
});
