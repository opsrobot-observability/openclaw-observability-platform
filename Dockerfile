# 构建阶段
FROM node:lts-alpine3.23 AS builder

WORKDIR /app

# 复制 package.json 和 lock 文件
COPY package.json package-lock.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建项目
RUN npm run build

# 生产阶段 - 使用 nginx 作为反向代理
FROM nginx:alpine AS production

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 从构建阶段复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 3000

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]