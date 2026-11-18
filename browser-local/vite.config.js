import { defineConfig } from 'vite';
import {explicitRhwpModulePlugin} from './scripts/rhwp-vite-plugin.mjs';
export default defineConfig({plugins:[explicitRhwpModulePlugin()],base:'./',build:{outDir:'dist',emptyOutDir:true,target:'es2022',rollupOptions:{output:{entryFileNames:'assets/local-bundle.js',chunkFileNames:'assets/local-chunk-[hash].js'}}},server:{host:'127.0.0.1',allowedHosts:['terminal.local']},preview:{host:'127.0.0.1',port:4173}});
