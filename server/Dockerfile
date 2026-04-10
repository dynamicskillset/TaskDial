FROM node:20-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /build/dist ./dist/
RUN mkdir /data && chown app:app /data
USER app
ENV NODE_ENV=production
ENV DB_PATH=/data/chronotasker.db
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/index.js"]
