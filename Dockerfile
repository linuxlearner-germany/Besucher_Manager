FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json /app/package.json
COPY apps/backend/package.json /app/apps/backend/package.json
COPY apps/frontend/package.json /app/apps/frontend/package.json

RUN npm install

COPY . /app
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app
RUN npm prune --omit=dev
RUN mkdir -p /app/uploads

EXPOSE 3030

CMD ["npm", "run", "start", "--workspace", "@besucher-manager/backend"]
