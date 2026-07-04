# Multi-stage build for the SalesOS monorepo. Targets: api, web.
FROM node:22-slim AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm turbo build

FROM node:22-slim AS api
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY --from=build /app .
EXPOSE 3011
CMD ["node", "apps/api/dist/main.js"]

FROM node:22-slim AS web
RUN corepack enable
WORKDIR /app
COPY --from=build /app .
EXPOSE 3000
CMD ["pnpm", "--filter", "@salesos/web", "start"]
