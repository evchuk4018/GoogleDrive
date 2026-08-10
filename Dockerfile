FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ARG NEXT_PUBLIC_DRIVE_BASE_PATH=/drive
ENV NEXT_PUBLIC_DRIVE_BASE_PATH=${NEXT_PUBLIC_DRIVE_BASE_PATH}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run typecheck && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ARG NEXT_PUBLIC_DRIVE_BASE_PATH=/drive
ENV NODE_ENV=production
ENV NEXT_PUBLIC_DRIVE_BASE_PATH=${NEXT_PUBLIC_DRIVE_BASE_PATH}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/migrations ./migrations
COPY docker/entrypoint.sh /usr/local/bin/googledrive-entrypoint
RUN chmod +x /usr/local/bin/googledrive-entrypoint
EXPOSE 3000
ENTRYPOINT ["googledrive-entrypoint"]
