import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

// Apps Android: cada um leva só as imagens da sua área (Kids sozinho tem ~50 MB).
const APP_DROPPED_ASSETS = {
  app: ['kids', 'teen', 'kids-bg.png'],
  'app-kids': ['teen'],
  'app-teen': ['kids', 'kids-bg.png'],
}
const listFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)])
    : []
const dropAssets = (paths) => ({
  name: 'drop-app-assets',
  apply: 'build',
  closeBundle() {
    for (const p of paths) rmSync(resolve('dist', p), { recursive: true, force: true })
    // Apps Kids/Teens: public/kids e public/teen têm muita imagem antiga que o código
    // não usa mais. Só fica no pacote o arquivo cujo nome aparece no JS/CSS/HTML gerado.
    const code = [...listFiles(resolve('dist/assets')), resolve('dist/index.html')]
      .filter((f) => /\.(js|css|html)$/.test(f))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    for (const f of [...listFiles(resolve('dist/kids')), ...listFiles(resolve('dist/teen'))]) {
      const name = basename(f)
      if (!code.includes(name) && !code.includes(encodeURIComponent(name))) rmSync(f, { force: true })
    }
  },
})

// https://vite.dev/config/
// --mode app / app-kids / app-teen = apps Android (Capacitor): sem service worker do PWA.
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    APP_DROPPED_ASSETS[mode] && dropAssets(APP_DROPPED_ASSETS[mode]),
    VitePWA({
      disable: mode.startsWith('app'),
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
