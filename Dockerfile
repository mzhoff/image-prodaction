# syntax=docker/dockerfile:1.7

FROM node:24.15.0-alpine3.23 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm_token \
  set -eu; \
  npm_config_path=/tmp/npmrc; \
  export NPM_CONFIG_USERCONFIG="$npm_config_path"; \
  trap 'rm -f "$npm_config_path"' EXIT; \
  npm config set @prodactionpro:registry https://npm.pkg.github.com; \
  if [ -s /run/secrets/npm_token ]; then \
    npm config set //npm.pkg.github.com/:_authToken "$(cat /run/secrets/npm_token)"; \
  fi; \
  npm ci

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24.15.0-alpine3.23 AS runtime
WORKDIR /app
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=dependencies --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json package-lock.json tsconfig.json drizzle.config.ts ./
COPY --chown=nextjs:nodejs drizzle ./drizzle
COPY --chown=nextjs:nodejs docs/assistant-knowledge ./docs/assistant-knowledge
COPY --chown=nextjs:nodejs scripts ./scripts
COPY --chown=nextjs:nodejs src ./src

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
