import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
import { adminBase } from '@/lib/paths';
const handlers = toNextJsHandler(auth);
// Some adapters pass a URL with Next's basePath already removed.
function withBase(request: Request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${adminBase}/`)) {
    url.pathname = `${adminBase}${url.pathname}`;
    return new Request(url, request);
  }
  return request;
}
export const GET = (request: Request) => handlers.GET(withBase(request));
export const POST = (request: Request) => handlers.POST(withBase(request));
