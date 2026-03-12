# 动态构建版本（默认）：容器启动时执行 `npm run build` 生成 dist，再由 nginx 提供静态文件。

FROM node:22-alpine

WORKDIR /app

ENV HUSKY=0

COPY package.json package-lock.json ./
RUN npm ci && apk add --no-cache nginx

COPY . .

COPY docker/nginx/default.conf /etc/nginx/http.d/default.conf
COPY docker/entrypoint-build-and-serve.sh /usr/local/bin/entrypoint-build-and-serve.sh
RUN chmod +x /usr/local/bin/entrypoint-build-and-serve.sh

EXPOSE 80

STOPSIGNAL SIGQUIT

ENTRYPOINT ["/usr/local/bin/entrypoint-build-and-serve.sh"]
