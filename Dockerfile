# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG CONTENT_API_URL
ARG PUBLIC_ADMIN_API_URL
# In Docker builds, supply the private token with BuildKit --secret.
RUN --mount=type=secret,id=CONTENT_API_TOKEN \
    CONTENT_API_TOKEN="$(cat /run/secrets/CONTENT_API_TOKEN 2>/dev/null || true)" npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/frontend.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
