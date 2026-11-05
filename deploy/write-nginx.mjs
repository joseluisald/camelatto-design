import { writeFile } from 'node:fs/promises';
import { siteConfig } from '../site.config.mjs';
import { nginxConfig, proxyHeaders } from './nginx.mjs';
await writeFile('/tmp/camelatto-nginx.conf', nginxConfig({ base: siteConfig.base, runtimeDir: process.env.PUBLISH_RUNTIME_DIR || '/data', proxyCidrs: process.env.TRUSTED_PROXY_CIDRS }));
await writeFile('/tmp/camelatto-proxy-headers.conf', proxyHeaders);
