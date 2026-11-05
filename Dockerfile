# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app /data \
    && chown node:node /app /data
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
USER node
COPY --chown=node:node package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --chown=node:node admin/package.json admin/package-lock.json ./admin/
RUN cd admin && npm ci --ignore-scripts
COPY --chown=node:node . .
RUN npm run test:deploy
RUN cd admin && npx prisma generate
RUN npm run build
# Build-only placeholders: no database, production credential or .env is copied.
RUN cd admin \
    && DB_HOST=127.0.0.1 DB_USER=build DB_PASSWORD=build DB_NAME=build \
       ADMIN_ORIGIN=http://localhost:4321 \
       BETTER_AUTH_SECRET=build-only-placeholder-not-used-at-runtime-000000 \
       NEXT_BUILD_CPUS=2 npm run build -- --webpack
ENV NODE_ENV=production \
    PUBLISH_RUNTIME_DIR=/data \
    STORAGE_PATH=/data/storage \
    BACKUP_PATH=/data/backups
RUN node deploy/write-nginx.mjs \
    && nginx -t -c /tmp/camelatto-nginx.conf \
    && node deploy/smoke-nginx.mjs
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD ["node", "/app/deploy/healthcheck.mjs"]
CMD ["node", "/app/deploy/start.mjs"]
