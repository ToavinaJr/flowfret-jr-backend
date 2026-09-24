FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
COPY requirements.youtube.txt /tmp/requirements.youtube.txt
RUN apk add --no-cache python3 py3-pip \
    && pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.youtube.txt
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package*.json ./
CMD ["node", "dist/main.js"]

