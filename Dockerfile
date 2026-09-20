# Moonlight Seva — the game and its session server in one container.
#
#   docker build -t moonlight-seva .
#   docker run -p 8787:8787 -e MAX_PLAYERS=4 moonlight-seva
#
# The server serves the built game and the WebSocket beside it, so there is one URL, one port and
# no CORS. Node 22 is required: the server runs TypeScript directly through Node's own stripping.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
# The server reads the shared rules from source, so src/ ships with it.
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/server ./server
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8787/healthz || exit 1
CMD ["node", "--experimental-strip-types", "server/index.ts"]
