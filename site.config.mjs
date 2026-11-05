// A single deployment prefix for Astro, the admin and public APIs.
export const siteConfig = {
  site: 'https://demos.jlacode.com.br',
  base: '/camelatto-design',
};

export function joinBase(base, path = '') {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export const adminBasePath = joinBase(siteConfig.base, 'admin');
