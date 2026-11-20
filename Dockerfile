# Stage 1: Build shared, server, and client workspaces
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.base.json tsconfig.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY server/package.json server/tsconfig.json ./server/
COPY client/package.json client/tsconfig.json ./client/

RUN npm install

COPY shared ./shared
COPY server ./server
COPY client ./client

RUN npm run build

# Stage 2: Minimal production runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
ENV DATA_DIR=/app/data

COPY package.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install --omit=dev --workspace=@capitalloop/shared --workspace=@capitalloop/server

COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "server/dist/index.js"]