FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 --ingroup app app
USER app

CMD ["bun", "run", "index.ts"]
