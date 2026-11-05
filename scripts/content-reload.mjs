import { existsSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Publishing invalidates Astro's cached getStaticPaths in development as well.
export function contentReload() {
  let watcher;
  let timer;
  return {
    name: 'camelatto:published-content',
    apply: 'serve',
    configureServer(server) {
      const directory = fileURLToPath(new URL('../admin/storage/', import.meta.url));
      if (!existsSync(directory)) return;
      watcher = watch(directory, (_event, file) => {
        if (String(file) !== 'published.json') return;
        clearTimeout(timer);
        timer = setTimeout(() => server.restart().catch(() => server.config.logger.error('Não foi possível recarregar o conteúdo publicado. Reinicie o Astro.')), 300);
      });
    },
    closeBundle() { clearTimeout(timer); watcher?.close(); },
  };
}
