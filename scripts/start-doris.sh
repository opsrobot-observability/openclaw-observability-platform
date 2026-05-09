#!/bin/bash
# Doris 启动脚本：启动 Doris 服务后执行初始化 SQL

set -e

INIT_SQL="/opt/apache-doris/init-doris-schema.sql"

# 按容器可用内存动态下调 FE JVM，避免低内存机器 OOM
FE_CONF="/opt/apache-doris/fe/conf/fe.conf"
if [ -f "$FE_CONF" ]; then
    MEM_TOTAL_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
    if [ "${MEM_TOTAL_MB:-0}" -gt 0 ]; then
        # 预留系统内存后取 40%，并限制在 [1024, 4096]MB
        FE_HEAP_MB=$(( MEM_TOTAL_MB * 40 / 100 ))
        if [ "$FE_HEAP_MB" -lt 1024 ]; then FE_HEAP_MB=1024; fi
        if [ "$FE_HEAP_MB" -gt 4096 ]; then FE_HEAP_MB=4096; fi

        sed -i "s/-Xmx[0-9]\+m/-Xmx${FE_HEAP_MB}m/g" "$FE_CONF" || true
        sed -i "s/-Xms[0-9]\+m/-Xms${FE_HEAP_MB}m/g" "$FE_CONF" || true
        echo "FE JVM heap 已自动设置为 ${FE_HEAP_MB}m（MemTotal=${MEM_TOTAL_MB}MB）"
    fi
fi
# 先启动 Doris 服务（在后台运行）
echo "启动 Doris 服务..."
[ -f "entry_point.sh" ] && bash entry_point.sh &  # doris:4.0.3-all-slim 镜像使用 entry_point.sh
[ -f "/usr/local/bin/docker-entrypoint.sh" ] && bash /usr/local/bin/docker-entrypoint.sh &  #doris-standalone:4.0.3 镜像使用 docker-entrypoint.sh
DORIS_PID=$!

# 等待 FE 就绪（使用 mysql client 检查）
echo "等待 Doris FE 就绪..."
until mysql -h127.0.0.1 -P9030 -uroot -e "SELECT 1" >/dev/null 2>&1; do
    echo "等待 FE 就绪中..."
    sleep 3
done
echo "Doris FE 已就绪"

# 等待 BE 就绪
echo "等待 Doris BE 就绪..."
until mysql -h127.0.0.1 -P9030 -uroot -e "SHOW BACKENDS\G" 2>/dev/null | grep -q "Alive: true"; do
    echo "等待 BE 就绪中..."
    sleep 5
done
echo "Doris BE 已就绪"

# 设置 root 密码（仅当 DORIS_PASSWORD 不为空且能无密码登录时）
if [ -n "${DORIS_PASSWORD}" ] && mysql -h127.0.0.1 -P9030 -uroot -e "SELECT 1" >/dev/null 2>&1; then
    echo "设置 Doris root 密码..."
    mysql -h127.0.0.1 -P9030 -uroot -e "SET PASSWORD FOR 'root' = PASSWORD('${DORIS_PASSWORD}');" 2>/dev/null || \
    mysql -h127.0.0.1 -P9030 -uroot -e "ALTER USER 'root'@'%' IDENTIFIED BY '${DORIS_PASSWORD}';" 2>/dev/null || \
    mysql -h127.0.0.1 -P9030 -uroot -e "SET PASSWORD = PASSWORD('${DORIS_PASSWORD}');" 2>/dev/null
    echo "Doris root 密码已设置"
fi

# 执行初始化脚本（如果存在）
if [ -f "$INIT_SQL" ]; then
    echo "执行数据库初始化..."
    mysql -h127.0.0.1 -P9030 -uroot < "$INIT_SQL"
    echo "数据库初始化完成"
else
    echo "未找到初始化脚本: $INIT_SQL"
fi

# 等待后台进程退出
wait $DORIS_PID