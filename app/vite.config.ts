/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const shared = fileURLToPath(new URL('../supabase/functions/_shared', import.meta.url))
const src = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0') },
  resolve: { alias: { '@shared': shared, '@': src } },
  server: { fs: { allow: ['..'] } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'LAR. — A vida da casa, em equilíbrio.',
        short_name: 'LAR. — A vida da casa, em equilíbrio.',
        description: 'Gestão doméstica e financeira da família: stock, compras, despesas, contas e objetivos.',
        lang: 'pt-PT',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF7F3',
        theme_color: '#FAF7F3',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Os dados vêm do Supabase e ficam em cache no IndexedDB (TanStack Query) — não no service worker.
        runtimeCaching: [],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'node' },
})
