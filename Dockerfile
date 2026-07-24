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
COPY apps/backend/package.json /app/apps/backend/package.json
COPY apps/frontend/package.json /app/apps/frontend/package.json

RUN npm install --verbose

COPY . /app
RUN npm run build --verbose

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

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
