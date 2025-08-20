#syntax=docker/dockerfile:1.17-labs
ARG base_image=node:24-alpine3.22

#
# Install dependencies
#
FROM ${base_image} AS deps

WORKDIR /app

ARG NPM_REGISTRY_SERVER

ENV \
  NPM_CONFIG_CACHE=/cache/npm \
  XDG_CACHE_HOME=/cache

COPY package*.json pnpm-lock.* ./

RUN --mount=type=secret,id=NPM_USER --mount=type=secret,id=NPM_PASSWORD --mount=type=cache,target=/cache <<EOF
  echo "Setting up npm registry"
  set -e
  corepack enable pnpm npm
  if [ ! -z "${NPM_REGISTRY_SERVER}" ] ; then
    echo "Using custom registry at: ${NPM_REGISTRY_SERVER}"
    if [ -z "${NPM_USER}" -o -z "${NPM_PASSWORD}" ] ; then
      if [ ! -f /run/secrets/NPM_USER  -o ! -f /run/secrets/NPM_PASSWORD ] ; then
        echo "Custom registry credentials not passed as secrets"
        exit 1
      fi
      export NPM_USER="$(cat /run/secrets/NPM_USER)"
      export NPM_PASS="$(cat /run/secrets/NPM_PASSWORD)"
    else
      export NPM_PASS="${NPM_PASSWORD}"
    fi
    if [ -z "$NPM_USER" -o -z "$NPM_PASS" ] ; then
      echo "Custom registry credentials not set"
      exit 1
    fi
    echo "Logging in to custom registry"
    pnpx npm-cli-login@1.0.0 -r "${NPM_REGISTRY_SERVER}" -e "${NPM_USER}@kausal.tech"
    echo "@kausal-private:registry=${NPM_REGISTRY_SERVER}" >> $HOME/.npmrc
    echo "registry=https://registry.npmjs.org/" >> $HOME/.npmrc
  fi
EOF

RUN --mount=type=cache,target=/cache <<EOF
  echo "Installing npm dependencies"
  set -e
  if [ -f pnpm-lock.yaml ]; then
    pnpm config set store-dir /cache/pnpm-store
    echo "nodeLinker: hoisted" > pnpm-workspace.yaml
    pnpm install --frozen-lockfile
  else
    npm ci
  fi
EOF

RUN <<EOF
  echo "Checking for private themes"
  set -e
  if grep -q "@kausal-private/themes-private" package.json && [ -n "${NPM_REGISTRY_SERVER}" ]; then
    if [ ! -d /app/node_modules/@kausal-private/themes-private ]; then
      echo "Private themes not found in node_modules"
      exit 1
    fi
  fi
EOF

#
# NextJS base
#
FROM ${base_image} AS nextjs_base

RUN <<EOF
  set -e
  apk update
  apk add --no-cache bash multirun
  apk add --no-cache caddy --repository https://dl-cdn.alpinelinux.org/alpine/edge/community
  rm -rf /var/cache/apk
EOF

ENV NODE_ENV=production
ARG NEXTJS_STANDALONE_BUILD=1
ENV NEXTJS_STANDALONE_BUILD=${NEXTJS_STANDALONE_BUILD}
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXTJS_ASSET_PREFIX_PLACEHOLDER=https://__kausal_asset_prefix_placeholder__
ARG SENTRY_DSN_PLACEHOLDER=__KAUSAL_SENTRY_DSN_PLACEHOLDER__
ARG DEPLOYMENT_TYPE_PLACEHOLDER=__KAUSAL_DEPLOYMENT_TYPE_PLACEHOLDER__

WORKDIR /app

ARG SENTRY_PROJECT=watch-ui
ARG SENTRY_DEBUG=0

#
# NextJS builder
#
FROM nextjs_base AS builder

RUN --mount=type=cache,target=/tools <<EOF
  echo "Installing SBOM tools"
  set -e
  apk update
  apk add --no-cache icu
  if [ ! -f /tools/cyclonedx ]; then
    apk add --no-cache curl
    curl -L -o /tools/cyclonedx https://github.com/CycloneDX/cyclonedx-cli/releases/download/v0.28.2/cyclonedx-linux-musl-x64
    chmod a+x /tools/cyclonedx
  fi
EOF

COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the files
COPY --exclude=kausal_common/docker . .

# For Sentry source map upload
ARG SENTRY_PROJECT
ARG SENTRY_URL
ARG SENTRY_ORG
ARG SENTRY_SPOTLIGHT=0

# Code coverage builds are done separately
ARG CODE_COVERAGE=0

COPY kausal_common/docker/manage-nextjs-cache.sh /
# Remove the NextJS build cache if packages change
RUN --mount=type=cache,target=/app/.next/cache \
  /manage-nextjs-cache.sh check

ARG BUILD_ID
ARG SENTRY_RELEASE=${SENTRY_PROJECT}@${BUILD_ID}
ENV BUILD_ID=${BUILD_ID} SENTRY_RELEASE=${SENTRY_RELEASE}

ENV \
  SENTRY_PROJECT=${SENTRY_PROJECT} \
  SENTRY_URL=${SENTRY_URL} \
  SENTRY_ORG=${SENTRY_ORG} \
  SENTRY_DEBUG=${SENTRY_DEBUG} \
  SENTRY_DSN_PLACEHOLDER="${SENTRY_DSN_PLACEHOLDER}" \
  SENTRY_SPOTLIGHT=${SENTRY_SPOTLIGHT} \
  NEXTJS_BUILD_ID=${BUILD_ID} \
  NEXTJS_ASSET_PREFIX=${NEXTJS_ASSET_PREFIX_PLACEHOLDER} \
  DEPLOYMENT_TYPE="${DEPLOYMENT_TYPE_PLACEHOLDER}" \
  CODE_COVERAGE=${CODE_COVERAGE}

# Build the NextJS bundle
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN --mount=type=cache,target=/app/.next/cache <<EOF
  echo "Building NextJS bundle"
  set -e
  corepack enable
  npm run build -- --no-mangling
  if [ ${CODE_COVERAGE} -ne 1 ]; then
    /manage-nextjs-cache.sh save
  fi
EOF

RUN --mount=type=cache,target=/tools <<EOF
  if [ ${CODE_COVERAGE} -eq 1 ]; then
    echo "Skipping SBOM generation for code coverage build"
    mv .next-coverage .next
    exit 0
  fi
  echo "Generating SBOM"
  set -e
  mkdir /sbom
  cd /app/public/static/sbom
  /tools/cyclonedx merge --input-files */bom.json --output-file /sbom/nextjs.cdx.json \
    --name ${SENTRY_PROJECT} --version ${BUILD_ID}

  for dir in * ; do
    mv ${dir}/bom.json /sbom/${dir}.cdx.json
    /tools/cyclonedx convert --input-format json --output-format spdxjson --input-file /sbom/${dir}.cdx.json --output-file /sbom/${dir}.spdx.json
  done
EOF

FROM nextjs_base AS final

# Add nextjs user
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs && chown nextjs:nodejs /app

# For non-standalone builds
# COPY --chown=nextjs:nodejs --from=deps /app/node_modules ./node_modules
# COPY --chown=nextjs:nodejs --from=builder /app/.next ./.next
# COPY --chown=nextjs:nodejs --from=builder /app/dist ./dist
# COPY --exclude=docker --exclude=Dockerfile --chown=nextjs:nodejs . .
# COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# For standalone builds
COPY --chown=nextjs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/package-lock.json* /app/pnpm-lock.yaml* ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs --parents /app/node_modules/./@kausal-private* ./node_modules/
COPY --from=builder /sbom* /

COPY ./kausal_common/docker/start-server.sh /entrypoint.sh
COPY ./kausal_common/docker/Caddyfile /etc/caddy/

ARG BUILD_ID
ARG SENTRY_RELEASE
ARG SENTRY_PROJECT=watch-ui
ARG SENTRY_SPOTLIGHT=0

ENV \
  SENTRY_RELEASE=${SENTRY_RELEASE} \
  BUILD_ID=${BUILD_ID} \
  SENTRY_PROJECT=${SENTRY_PROJECT} \
  SENTRY_SPOTLIGHT=${SENTRY_SPOTLIGHT} \
  APP_ROOT=/app

RUN <<EOF
  export PH_FN=runtime-placeholders.txt
  if [ -n "${SENTRY_DSN_PLACEHOLDER}" ]; then echo "SENTRY_DSN|${SENTRY_DSN_PLACEHOLDER}" >>$PH_FN; fi
  if [ -n "${NEXTJS_ASSET_PREFIX_PLACEHOLDER}" ]; then echo "NEXTJS_ASSET_PREFIX|${NEXTJS_ASSET_PREFIX_PLACEHOLDER}" >>$PH_FN; fi
  if [ -n "${DEPLOYMENT_TYPE_PLACEHOLDER}" ]; then echo "DEPLOYMENT_TYPE|${DEPLOYMENT_TYPE_PLACEHOLDER}" >>$PH_FN; fi
EOF

RUN <<EOF
  export PHF_FN=runtime-placeholder-files.txt
  export PHF_FILES=$(find .next -name '*.json' -o -name '*.html' -o -name '*.js' -o -name '*.css')
  grep -l -e "${SENTRY_DSN_PLACEHOLDER}" -e "${NEXTJS_ASSET_PREFIX_PLACEHOLDER}" -e "${DEPLOYMENT_TYPE_PLACEHOLDER}" $PHF_FILES > $PHF_FN
  echo server.js >> $PHF_FN
EOF

ARG NEXTJS_PORT=3000
ARG CADDY_PORT=3001
ARG METRICS_PORT=9464
ENV NEXTJS_PORT=${NEXTJS_PORT} CADDY_PORT=${CADDY_PORT} METRICS_PORT=${METRICS_PORT}

LABEL nextjs_build_id="${BUILD_ID}"

EXPOSE ${PORT} ${CADDY_PORT} ${METRICS_PORT}
ENTRYPOINT ["/entrypoint.sh"]
