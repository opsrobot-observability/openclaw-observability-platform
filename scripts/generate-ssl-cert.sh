#!/bin/bash

# 自签名 SSL 证书生成脚本
# 用于开发和测试环境的 HTTPS 部署

set -e

CERT_DIR="./ssl"
CERT_FILE="${CERT_DIR}/cert.pem"
KEY_FILE="${CERT_DIR}/key.pem"

echo "================================================"
echo "生成自签名 SSL 证书 (用于开发/测试环境)"
echo "================================================"

# 创建 SSL 证书目录
mkdir -p "${CERT_DIR}"

# 生成自签名证书 (有效期 365 天)
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout "${KEY_FILE}" \
  -out "${CERT_FILE}" \
  -days 365 \
  -subj "/C=CN/ST=State/L=City/O=Organization/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo ""
echo "✓ SSL 证书已生成:"
echo "  - 证书文件: ${CERT_FILE}"
echo "  - 私钥文件: ${KEY_FILE}"
echo ""
echo "⚠️  注意: 这是自签名证书,浏览器会显示不安全警告"
echo "   在生产环境中,请使用 Let's Encrypt 或商业 CA 证书"
echo ""
echo "🔧 接下来请运行: docker compose up -d"
echo "================================================"
