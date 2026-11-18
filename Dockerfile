FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
RUN bun prune --production

FROM node:22-bookworm-slim
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
COPY requirements.youtube.txt /tmp/requirements.youtube.txt
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.youtube.txt
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD bun -e "fetch('http://127.0.0.1:3000/').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
USER node
CMD ["bun", "run", "start:prod"]

