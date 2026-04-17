# HTTPS 部署指南

本指南说明如何使用 HTTPS 部署 OpenClaw Observability Platform 前端服务。

## 快速开始

### 1. 生成 SSL 证书

首先,运行脚本生成自签名证书(用于开发/测试环境):

```bash
./scripts/generate-ssl-cert.sh
```

这将在 `./ssl/` 目录下生成:
- `cert.pem` - SSL 证书文件
- `key.pem` - SSL 私钥文件

### 2. 启动服务

```bash
docker compose up -d
```

### 3. 访问应用

- **HTTPS 访问**: https://localhost
- **HTTP 访问**: http://localhost (自动跳转到 HTTPS)

## 配置说明

### 端口配置

默认端口映射:
- **HTTP**: 80 (自动跳转到 HTTPS)
- **HTTPS**: 443

可通过环境变量自定义端口:

```bash
# 在 .env 文件中配置或命令行设置
export FRONTEND_HTTP_PORT=8080
export FRONTEND_HTTPS_PORT=8443

docker compose up -d
```

### Nginx 配置详解

配置文件位于 `nginx.conf`,包含:

#### HTTP 服务块 (自动跳转)
```nginx
server {
    listen 80;
    server_name localhost;
    return 301 https://$server_name$request_uri;
}
```

#### HTTPS 服务块
```nginx
server {
    listen 443 ssl http2;
    server_name localhost;

    # SSL 证书路径
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # TLS 协议版本
    ssl_protocols TLSv1.2 TLSv1.3;
    ...
}
```

### Docker Compose 配置

在 `docker-compose.yml` 中,前端服务配置:

```yaml
frontend:
  ports:
    - "${FRONTEND_HTTP_PORT:-80}:80"
    - "${FRONTEND_HTTPS_PORT:-443}:443"
  volumes:
    - ./ssl:/etc/nginx/ssl:ro  # 挂载 SSL 证书(只读)
```

## 生产环境部署

### 使用 Let's Encrypt 证书

对于生产环境,建议使用 Let's Encrypt 免费证书:

1. **安装 Certbot**:
```bash
# Ubuntu/Debian
sudo apt install certbot

# macOS
brew install certbot
```

2. **获取证书**:
```bash
sudo certbot certonly --standalone -d your-domain.com
```

3. **复制证书到 SSL 目录**:
```bash
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/key.pem
sudo chmod 644 ./ssl/cert.pem
sudo chmod 600 ./ssl/key.pem
```

4. **更新 nginx.conf 中的 server_name**:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;  # 修改为你的域名
    ...
}
```

5. **设置自动续期**:
```bash
sudo certbot renew --dry-run
```

### 使用商业 CA 证书

如果您有商业 CA 签发的证书:

1. 将证书文件复制到 `./ssl/` 目录:
   - `cert.pem` - 证书文件(可能是 `.crt` 或 `.pem` 格式)
   - `key.pem` - 私钥文件(可能是 `.key` 格式)

2. 如果有中间证书,合并到主证书:
```bash
cat your-cert.crt intermediate.crt > ./ssl/cert.pem
cp your-private.key ./ssl/key.pem
```

## 安全最佳实践

### 1. 证书文件权限
```bash
chmod 644 ./ssl/cert.pem
chmod 600 ./ssl/key.pem
```

### 2. 安全头部

nginx 配置已包含安全头部:
- `Strict-Transport-Security` - 强制 HTTPS
- `X-Frame-Options` - 防止点击劫持
- `X-Content-Type-Options` - 防止 MIME 嗅探
- `X-XSS-Protection` - XSS 保护

### 3. TLS 配置

默认使用现代化的 TLS 配置:
- 支持协议: TLSv1.2, TLSv1.3
- 推荐加密套件(Forward Secrecy)
- 禁用弱加密算法

### 4. 定期更新证书

- 自签名证书默认有效期 365 天
- Let's Encrypt 证书有效期 90 天
- 建议设置自动化续期流程

## 故障排查

### 浏览器显示"不安全"警告

**原因**: 使用自签名证书

**解决方案**:
- **开发环境**: 点击"高级"→"继续访问"
- **生产环境**: 使用 Let's Encrypt 或商业 CA 证书

### 端口 80/443 已被占用

**解决方案**: 修改端口映射
```bash
export FRONTEND_HTTP_PORT=8080
export FRONTEND_HTTPS_PORT=8443
docker compose up -d
```

### SSL 证书加载失败

检查证书文件是否存在:
```bash
ls -lh ./ssl/
```

应该看到:
```
-rw-r--r-- 1 user group 2.0K Jan 1 12:00 cert.pem
-rw------- 1 user group 3.2K Jan 1 12:00 key.pem
```

### 健康检查失败

查看容器日志:
```bash
docker logs frontend
```

检查 nginx 配置语法:
```bash
docker exec frontend nginx -t
```

## 附录

### 环境变量参考

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `FRONTEND_HTTP_PORT` | 80 | HTTP 端口 |
| `FRONTEND_HTTPS_PORT` | 443 | HTTPS 端口 |

### 文件结构

```
.
├── docker-compose.yml          # Docker Compose 配置
├── nginx.conf                  # Nginx 配置文件
├── ssl/                        # SSL 证书目录
│   ├── cert.pem               # SSL 证书
│   └── key.pem                # SSL 私钥
└── scripts/
    └── generate-ssl-cert.sh   # 证书生成脚本
```

### 相关文档

- [Nginx SSL 模块文档](https://nginx.org/en/docs/http/ngx_http_ssl_module.html)
- [Let's Encrypt 官网](https://letsencrypt.org/)
- [Mozilla SSL 配置生成器](https://ssl-config.mozilla.org/)

## 支持

如遇到问题,请提交 Issue 到项目仓库。
