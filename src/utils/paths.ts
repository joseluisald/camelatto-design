export const sitePath = (path = '') => `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
export function contentLink(path: string) {
    const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
    return /^https?:\/\//i.test(path) || (base && (path === base || path.startsWith(`${base}/`))) ? path : sitePath(path);
}
