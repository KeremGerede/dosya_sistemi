# Production image: Vite build çıktısı yetkisiz (non-root) nginx ile sunulur; /api istekleri api servisine
# proxy'lenir. Uygulama kodu göreli /api yolunu kullandığı için backend adresi koda yazılmaz (D-038).
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
