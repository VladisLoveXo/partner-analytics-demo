# syntax=docker/dockerfile:1
# Build context: the repository root (npm workspaces share one lockfile).

FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY services/stats-service/package.json services/stats-service/
COPY services/partners-api/package.json services/partners-api/
COPY apps/web/package.json apps/web/
COPY tools/event-generator/package.json tools/event-generator/
RUN npm ci --workspace apps/web --include-workspace-root
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN npm run build --workspace apps/web

FROM nginx:1.30-alpine
ENV API_UPSTREAM=http://partners-api:4000
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 apps/web/nginx/40-app-config.sh /docker-entrypoint.d/40-app-config.sh
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
