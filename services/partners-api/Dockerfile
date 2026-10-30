# syntax=docker/dockerfile:1
# Build context: the repository root (npm workspaces share one lockfile).

FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY services/stats-service/package.json services/stats-service/
COPY services/partners-api/package.json services/partners-api/
COPY apps/web/package.json apps/web/
COPY tools/event-generator/package.json tools/event-generator/
RUN npm ci --workspace services/partners-api --include-workspace-root --ignore-scripts
COPY tsconfig.base.json ./
COPY services/partners-api services/partners-api
RUN npm run build --workspace services/partners-api

FROM node:24-alpine AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY services/stats-service/package.json services/stats-service/
COPY services/partners-api/package.json services/partners-api/
COPY apps/web/package.json apps/web/
COPY tools/event-generator/package.json tools/event-generator/
RUN npm ci --workspace services/partners-api --omit=dev --ignore-scripts

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY services/partners-api/package.json ./
COPY services/partners-api/migrations ./migrations
COPY services/partners-api/seed ./seed
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/services/partners-api/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
