// Public site configuration. The admin has its own independent configuration.
export const siteConfig = {
  site: 'https://demos.jlacode.com.br',
  base: '/camelatto-design',
};

export function joinBase(base, path = '') {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
