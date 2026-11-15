import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),
    // Segunda versión del código para los navegadores antiguos de las Smart TV
    // (Tizen, webOS…), que no entienden JavaScript moderno.
    legacy({ targets: ['chrome >= 53', 'safari >= 11'] }),
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
