# --- Builder stage: compile TypeScript ---
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./

# `--legacy-peer-deps` works around the eslint@10 / @typescript-eslint@6 peer
# conflict; appium-ios-simulator has macOS-only postinstall hooks, so
# `--ignore-scripts` keeps the Linux build moving.
RUN npm ci --ignore-scripts --legacy-peer-deps

COPY src ./src
RUN npm run build

# --- Runtime stage: production-only deps + compiled output ---
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts --legacy-peer-deps \
    && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p logs \
    && addgroup -S app \
    && adduser -S -G app app \
    && chown -R app:app /app

USER app

ENTRYPOINT ["node", "dist/index.js"]
