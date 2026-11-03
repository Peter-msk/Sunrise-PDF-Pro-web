import { defineConfig } from 'vite';
export default defineConfig({base:'./',build:{outDir:'dist',emptyOutDir:true,target:'es2022',rollupOptions:{output:{entryFileNames:'assets/local-bundle.js',chunkFileNames:'assets/local-chunk-[hash].js'}}},server:{host:'127.0.0.1'},preview:{host:'127.0.0.1',port:4173}});
