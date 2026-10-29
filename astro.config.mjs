// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import alpinejs from '@astrojs/alpinejs';
import compress from 'astro-compress';

export default defineConfig({
  site: "https://demos.jlacode.com.br",
  base: "/camelatto-design",
  vite: {
    plugins: [tailwindcss()],
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