import { adminBasePath } from '../site.config.mjs';
import path from 'node:path';

const config = {
  experimental: { cpus: Math.max(1, Math.min(4, Number(process.env.NEXT_BUILD_CPUS) || 2)) },
  turbopack: { root: path.resolve('..') },
  basePath: adminBasePath,
  env: {
    NEXT_PUBLIC_ADMIN_BASE_PATH: adminBasePath
  },
  serverExternalPackages: ['@prisma/client', 'mysql2', 'sharp'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;
