# GUI container image: Vite build served by nginx, /api/ proxied to the MOTHER service.
# Build context = repository root, because the GUI imports the team config (config/thresholds.json):
#   docker build -f GUI/Dockerfile -t nasa-hackathon-gui .
FROM node:20-alpine AS build
WORKDIR /src/GUI
COPY GUI/package.json GUI/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY config/ /src/config/
COPY GUI/ ./
RUN npm run build

FROM nginx:1.27-alpine
ENV MOTHER_UPSTREAM=mother:8000 \
    NGINX_ENVSUBST_FILTER=^MOTHER_
COPY GUI/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /src/GUI/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
