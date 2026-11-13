# PeerShare: the page on PAGE_HOST and the session shell on *.SESSION_ZONE, as static files
# behind nginx. TLS is the reverse proxy's job (Traefik on the ITMV VPS).
#
#   docker build -f docker/Dockerfile .        # from the repository root
#
# The zones are compiled into the shell, and the relay's addresses are read from its bootstrap
# document at build time, so changing either means rebuilding the image.

FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.16.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

ARG PAGE_HOST=peershare.sandclaw.ai
ARG SESSION_ZONE=s.sandclaw.ai
ARG PARENT_ZONE=sandclaw.ai
ARG RELAY_DOCUMENT_URL=https://relay.httpeers.net/.well-known/httpeers-relay.json
# The commit (the workflow's short sha): .git is not in the build context, so the page, the
# proxy and the extension get it from here to name their build (build-info.mjs).
ARG BUILD_ID=""
ENV SITE=${PAGE_HOST} SESSION_ZONE=${SESSION_ZONE} PARENT_ZONE=${PARENT_ZONE} \
    RELAY_DOCUMENT_URL=${RELAY_DOCUMENT_URL} PEERSHARE_COMMIT=${BUILD_ID}

# The page with peershare.json and proxy/, then the UI gallery under /ui and the help site
# under /help (what the former peershare-site workflow published), then the shell.
RUN pnpm --filter "@statewalker/peershare.app^..." run --if-present build \
 && node apps/peershare.app/scripts/build-site.mjs /out \
 && mv "/out/${SITE}" /out/page \
 && rm -rf /out/page/.site \
 && pnpm --filter @statewalker/peershare.share-react build:gallery --outDir /out/page/ui \
 && pnpm --filter @statewalker/peershare.help build \
 && mkdir -p /out/page/help && cp -R apps/peershare.help/dist/. /out/page/help/ \
 && node apps/peershare.app/scripts/build-shell.mjs /out/shell

FROM nginx:1.29-alpine
ARG PAGE_HOST=peershare.sandclaw.ai
ARG SESSION_ZONE=s.sandclaw.ai
ARG PARENT_ZONE=sandclaw.ai
ARG BUILD_ID=""
# Read by the nginx image's envsubst step for /etc/nginx/templates/*.template.
ENV PAGE_HOST=${PAGE_HOST} SESSION_ZONE=${SESSION_ZONE} PARENT_ZONE=${PARENT_ZONE}
LABEL org.opencontainers.image.source="https://github.com/sandclaw-ai/peershare" \
      org.opencontainers.image.revision="${BUILD_ID}"
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/peershare.conf.template /etc/nginx/templates/peershare.conf.template
COPY --from=build /out/page /usr/share/nginx/page
COPY --from=build /out/shell /usr/share/nginx/shell
EXPOSE 80
