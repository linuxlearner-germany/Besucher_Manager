FROM node:22-bookworm-slim AS build

WORKDIR /app

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
ENV no_proxy=${no_proxy}

COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
COPY apps/backend/package.json /app/apps/backend/package.json
COPY apps/frontend/package.json /app/apps/frontend/package.json

RUN npm ci --verbose

COPY . /app
RUN npm run build --verbose

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# The application establishes outbound TLS connections (for example to the
# configured mail relay). Keep certificate validation enabled and provide the
# operating-system trust store in the production image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG APP_COMMIT=unknown
ENV APP_COMMIT=${APP_COMMIT}
LABEL org.opencontainers.image.revision=${APP_COMMIT}

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
ENV no_proxy=${no_proxy}

COPY --from=build /app /app
RUN npm prune --omit=dev
RUN mkdir -p /app/uploads

EXPOSE 3030

CMD ["npm", "run", "start", "--workspace", "@besucher-manager/backend"]
