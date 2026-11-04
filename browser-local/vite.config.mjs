import { defineConfig } from 'vite';
const base=process.env.SUNRISE_WEB_BASE || '/local/';
if(!base.startsWith('/') || !base.endsWith('/') || base.includes('..'))
  throw new Error('Invalid SUNRISE_WEB_BASE');
export default defineConfig({base,build:{rollupOptions:{output:{
 entryFileNames:'assets/local-bundle.js',
 chunkFileNames:'assets/chunk-[name]-[hash].js',
 assetFileNames:'assets/[name]-[hash][extname]'
}}}});
