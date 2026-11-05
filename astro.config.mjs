// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import alpinejs from '@astrojs/alpinejs';
import compress from 'astro-compress';
import { siteConfig, adminBasePath } from './site.config.mjs';
import { contentReload } from './scripts/content-reload.mjs';

export default defineConfig({
  site: siteConfig.site,
  base: siteConfig.base,
  vite: {
    server: {
      watch: { ignored: ['**/.publish/**', '**/admin/**', '**/dist/**'] },
      proxy: {
        // WebSocket upgrades retain the original URL, including Astro's base.
        [adminBasePath]: { target: 'http://127.0.0.1:3001', changeOrigin: true, ws: true },
        // Astro strips `base` before Vite's proxy middleware sees the URL.
        '/admin': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          rewrite: path => `${adminBasePath}${path.slice('/admin'.length)}`
        }
      }
    },
    plugins: [tailwindcss(), contentReload()],
    build: {
      target: 'es2022',
      minify: 'esbuild',
      cssMinify: 'lightningcss',
      sourcemap: false,
      reportCompressedSize: false
    }
  },
  build: {
    inlineStylesheets: 'auto'
  },
  integrations: [
    alpinejs({ entrypoint: '/src/entrypoint' }),
    compress({
      HTML: false,
      CSS: true,
      JavaScript: true,
      Image: true
    })
  ]
});
