# The portal, as one image that runs three ways.
#
#   web       node_modules/.bin/next start          (default)
#   worker    npm run worker
#   migrate   npx prisma migrate deploy             (a job, before the others)
#
# One image rather than three because they share every line of code, and three
# images means three things to keep on the same commit.
#
# ---------------------------------------------------------------------------
# Debian rather than Alpine
# ---------------------------------------------------------------------------
# Three native dependencies decide this. @node-rs/argon2 and sharp both load
# compiled binaries, and Prisma's query engine picks one at runtime from the
# platform it detects. All three publish glibc builds that work here without
# thought; on musl each is a separate question, and the image is a poor place to
# be answering them.

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
# The full image rather than slim: it already carries the toolchain and OpenSSL,
# and the runtime stage borrows the latter from it instead of installing it.
FROM node:22-bookworm AS build
WORKDIR /app

# Dependencies first, and only the manifests, so a source edit does not
# reinstall them. `npm ci` needs the dev dependencies here — next and typescript
# build the app — so this stage stays in development mode and only the runtime
# stage sets production.
ENV NODE_ENV=development
COPY package.json package-lock.json ./
# The postinstall hook runs `prisma generate`, which needs the schemas present.
COPY prisma ./prisma
RUN npm ci

COPY . .

# Both clients: the portal's own and the read-only legacy one. Already run by
# postinstall, repeated because the copy above may have brought newer schemas.
# The build needs their types.
RUN npm run db:generate
RUN NODE_ENV=production npm run build

# Drop what only the build needed.
RUN npm prune --omit=dev && npm cache clean --force

# Generate again, and this is not belt and braces.
#
# `npm prune` deletes node_modules/@prisma/client. It is a generated directory
# that no package.json lists as a dependency, so prune has no reason to believe
# anything wants it — and removing it leaves an image that builds cleanly and
# then dies on its first request with "Cannot find module .prisma/client".
# Which is exactly what the first build of this file did.
#
# Regenerating after the prune costs a few seconds and puts them back. `prisma`
# and `tsx` are in `dependencies` rather than devDependencies precisely so they
# survive to this point — and so the image can run `prisma migrate deploy` and
# the worker.
RUN npm run db:generate

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# ---------------------------------------------------------------------------
# OpenSSL, copied rather than installed
# ---------------------------------------------------------------------------
# Prisma's query engine links against OpenSSL, and the slim image carries
# neither the libraries nor a CA bundle. The obvious answer is `apt-get install`,
# and it is the wrong one here: it needs the Debian archive at build time, and a
# CI runner behind a proxy that intercepts TLS cannot reach it — which is
# exactly what happens on the network this was built on.
#
# The files come from the build stage instead. Same Debian release, same package
# versions, no network at build time, and the runtime image stays a quarter of
# the size of the full one.
COPY --from=build /usr/lib/x86_64-linux-gnu/libssl.so.3    /usr/lib/x86_64-linux-gnu/
COPY --from=build /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/
COPY --from=build /etc/ssl/certs/ca-certificates.crt       /etc/ssl/certs/

# Never root. Node's image already ships an unprivileged `node` user.
RUN chown node:node /app
USER node

# ---------------------------------------------------------------------------
# What is copied, and why each of it has to be
# ---------------------------------------------------------------------------
# node_modules comes across whole rather than being reinstalled, because it
# carries the two generated Prisma clients — they live inside node_modules and
# regenerating them here would need the schemas, the CLI and a second build.
#
# src/ is here for the worker, not for the web server. The worker runs through
# tsx: it imports nine modules by the `@/` path alias, which only tsconfig
# resolves, so compiling it to plain JavaScript would need a bundler to rewrite
# them. tsx sits in `dependencies` for exactly this reason — it is a runtime
# dependency of the worker, not a development tool.
#
# prisma/ is here so `prisma migrate deploy` can run from this image as a job.
# The migrations are the schema; an image that cannot apply them is an image
# that needs a second one standing beside it.
#
# scripts/ is here so the verification suite can be run against the environment
# it was deployed to, which is the only place some of it means anything — the
# UTC check in particular cannot fail on a UTC host.
COPY --chown=node:node --from=build /app/node_modules    ./node_modules
COPY --chown=node:node --from=build /app/.next           ./.next
COPY --chown=node:node --from=build /app/public          ./public
COPY --chown=node:node --from=build /app/src             ./src
COPY --chown=node:node --from=build /app/prisma          ./prisma
COPY --chown=node:node --from=build /app/scripts         ./scripts
COPY --chown=node:node --from=build /app/package.json    ./package.json
COPY --chown=node:node --from=build /app/next.config.ts  ./next.config.ts
COPY --chown=node:node --from=build /app/tsconfig.json   ./tsconfig.json

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# Liveness, not readiness. A container that answers this is running; whether it
# should be sent traffic is a question about the database and the cache, which
# /health/ready answers and which belongs to the load balancer rather than to
# the restart policy. Conflating them turns a database failover into a rolling
# restart of every replica.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/next", "start"]
