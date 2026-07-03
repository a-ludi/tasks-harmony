FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY . .
RUN mkdir -p /data && chown bun:bun /data
USER bun
ENV NODE_ENV=production
CMD ["bun", "run", "index.ts"]
