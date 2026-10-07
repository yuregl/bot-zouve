# Compiles TypeScript. Install scripts are skipped: yt-dlp and Git hooks are not needed to build.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Runs the bot with production dependencies only.
FROM node:22-bookworm-slim
# The Linux yt-dlp that youtube-dl-exec downloads on install is a Python program.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir logs && chown node:node logs
USER node
# Variables come from Docker Compose, so `npm start` (which reads .env) is not used.
CMD ["node", "dist/index.js"]
