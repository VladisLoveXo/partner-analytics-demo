# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY services/stats-service/package.json services/stats-service/
COPY services/partners-api/package.json services/partners-api/
COPY apps/web/package.json apps/web/
COPY tools/event-generator/package.json tools/event-generator/
RUN npm ci --workspace tools/event-generator --include-workspace-root --ignore-scripts
COPY tsconfig.base.json ./
COPY tools/event-generator tools/event-generator
RUN npm run build --workspace tools/event-generator

# No runtime dependencies: fetch and crypto come with Node.
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY tools/event-generator/package.json ./
COPY --from=build /repo/tools/event-generator/dist ./dist
USER node
CMD ["node", "dist/main.js"]
