import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

// App Android ainda sem Viva Kids/Teens: tira as imagens deles do pacote (~55 MB).
const dropKidsTeenAssets = () => ({
  name: 'drop-kids-teen-assets',
  apply: 'build',
  closeBundle() {
    for (const p of ['kids', 'teen', 'kids-bg.png']) rmSync(resolve('dist', p), { recursive: true, force: true })
  },
})

// https://vite.dev/config/
// --mode app = build do app Android (Capacitor): sem service worker do PWA.
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    mode === 'app' && dropKidsTeenAssets(),
    VitePWA({
      disable: mode === 'app',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo-viva-mais.png'],
      manifest: {
        name: 'Viva Mais Club',
        short_name: 'Viva Mais',
        description: 'Acesso aos benefícios do Viva Mais Club.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0B3C82',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3011',
        changeOrigin: true,
      },
    },
  },
}))
