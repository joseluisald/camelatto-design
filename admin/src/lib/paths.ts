import { adminBasePath } from '../../../site.config.mjs';
export const adminBase = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || adminBasePath;
export const adminUrl = (path = '') => `${adminBase}/${path.replace(/^\/+/, '')}`;
