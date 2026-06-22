# Base setup
FROM ubuntu:latest AS base

ENV NODE_VERSION=24
ENV NEXT_TELEMETRY_DISABLED=1
ENV DEBIAN_FRONTEND=noninteractive
ENV ROOT_DIR=/usr/boilerplate

# Install base deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    curl ca-certificates openssl build-essential libpq-dev bash \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && corepack enable \
 && corepack prepare pnpm@latest --activate \
 && npm install -g npm@latest \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m node

# API Build
FROM base AS api-base
WORKDIR $ROOT_DIR/api
RUN chown -R node:node $ROOT_DIR
USER node

COPY --chown=node:node api/ ./
RUN mkdir -p /usr/boilerplate/api/prisma/migrations

RUN pnpm i

FROM api-base AS api-dev
RUN pnpm prisma generate
CMD ["pnpm", "run", "dev"]

FROM api-base AS api-prd
RUN pnpm prisma generate && pnpm run build
CMD ["pnpm", "run", "start"]


# FE Build
FROM base AS fe-base
WORKDIR $ROOT_DIR/fe
RUN chown -R node:node $ROOT_DIR
USER node

COPY --chown=node:node frontend/ ./
RUN pnpm i && mkdir -p .next

FROM fe-base AS fe-dev
CMD ["pnpm", "run", "dev"]

FROM fe-base AS fe-prd
RUN pnpm run build
CMD ["pnpm", "run", "start"]
