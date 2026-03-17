# --- Stage 1: Build web frontend ---
FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- Stage 2: Build server ---
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/ ./
RUN npm run build

# --- Stage 3: Production image ---
# better-sqlite3 has native bindings; rebuild for the runtime platform.
FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/package.json ./server/package.json
COPY --from=server-build /app/server/package-lock.json ./server/package-lock.json
RUN cd server && npm ci --omit=dev && apk del python3 make g++
COPY --from=web-build /app/web/dist ./web/dist

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/data/heartbeat.db

VOLUME ["/data"]

CMD ["node", "server/dist/index.js"]
