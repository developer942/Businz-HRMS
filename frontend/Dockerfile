FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_DB_REST_URL=""
ARG VITE_DB_REST_KEY="vps-local-rest-key"
ENV VITE_DB_REST_URL=$VITE_DB_REST_URL
ENV VITE_DB_REST_KEY=$VITE_DB_REST_KEY
RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
