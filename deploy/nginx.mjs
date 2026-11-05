import path from 'node:path';
import { isIP } from 'node:net';

export function normalizedBase(base) {
  const value = base.replace(/\/+$/, '');
  if (value && (!/^\/[A-Za-z0-9_./-]+$/.test(value) || value.split('/').some(segment => segment === '.' || segment === '..'))) throw new Error('Base inválido para o servidor de produção.');
  return value;
}
const quote = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const regex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function nginxConfig({ base, runtimeDir, proxyCidrs = '172.16.0.0/12,10.0.0.0/8,192.168.0.0/16,127.0.0.1/32' }) {
  const prefix = normalizedBase(base);
  if (!path.isAbsolute(runtimeDir) || /[\r\n\0]/.test(runtimeDir)) throw new Error('Diretório de publicação inválido.');
  const trusted = proxyCidrs.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    const parts = value.split('/'); const [ip, bits] = parts; const version = isIP(ip);
    if (parts.length > 2 || !version || (bits !== undefined && (!/^\d+$/.test(bits) || Number(bits) > (version === 4 ? 32 : 128)))) throw new Error('TRUSTED_PROXY_CIDRS contém uma rede inválida.');
    return `set_real_ip_from ${value};`;
  }).join('\n    ');
  const rewrite = prefix ? `rewrite ^${regex(prefix)}/(.*)$ /$1 break;` : '';
  return `pid /tmp/camelatto-nginx.pid;
error_log /dev/stderr warn;
worker_processes auto;
events { worker_connections 1024; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  access_log /dev/stdout;
  server_tokens off;
  sendfile on;
  gzip on;
  gzip_types text/css text/javascript application/javascript application/json image/svg+xml;
  client_body_temp_path /tmp/camelatto-client-body;
  proxy_temp_path /tmp/camelatto-proxy;
  map $http_x_forwarded_proto $forwarded_proto { default $scheme; https https; http http; }
  server {
    listen 8080;
    server_name _;
    absolute_redirect off;
    error_page 404 ${prefix}/404.html;
    client_max_body_size 11m;
    ${trusted}
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;
    location = /healthz {
      access_log off;
      proxy_pass http://127.0.0.1:3001${prefix}/admin/api/health;
    }
    location = ${prefix}/admin {
      proxy_pass http://127.0.0.1:3001;
      include /tmp/camelatto-proxy-headers.conf;
    }
    location ^~ ${prefix}/admin/ {
      proxy_pass http://127.0.0.1:3001;
      include /tmp/camelatto-proxy-headers.conf;
    }
    location ^~ ${prefix}/_astro/ {
      alias ${quote(path.join(runtimeDir, 'assets') + '/')};
      add_header Cache-Control "public, max-age=31536000, immutable";
    }
    ${prefix ? `location = ${prefix} { return 308 ${prefix}/; }` : ''}
    location ${prefix}/ {
      root ${quote(path.join(runtimeDir, 'current'))};
      ${rewrite}
      try_files $uri/index.html $uri =404;
      add_header Cache-Control "no-cache";
    }
    ${prefix ? 'location / { return 404; }' : ''}
  }
}
`;
}
export const proxyHeaders = `proxy_http_version 1.1;
proxy_set_header Host $http_host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $forwarded_proto;
proxy_set_header Connection "";
proxy_read_timeout 120s;
`;
