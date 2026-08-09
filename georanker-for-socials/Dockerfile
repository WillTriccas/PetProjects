# GeoRanker for socials — container image for the upgrade path
# (Azure Container Apps / App Service B1+). The Free F1 tier deploys as *code*
# via deploy/azure-free.sh instead, but this image keeps that upgrade one step
# away with zero code changes.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
# SQLite lives on a mounted/persistent volume in production; default path here.
ENV DB_PATH=/data/georanker.sqlite
VOLUME ["/data"]
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/web/main.js"]
