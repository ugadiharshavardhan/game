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
    // The engine chunk (Three.js + Rapier's embedded WASM) is lazy-loaded when the player
    // presses Play, so the menu never pays for it. ~1.3 MB gzipped is expected.
    chunkSizeWarningLimit: 4000,
  },
});
