# Skill: prom-query
## 功能
查询服务监控、CPU、内存、错误率

## 常用 PromQL
- CPU使用率
sum(rate(container_cpu_usage_seconds_total[5m])) / sum(kube_node_allocatable_cpu_cores)

- 内存使用率
sum(container_memory_usage_bytes) / sum(kube_node_allocatable_memory_bytes)

- 接口 5xx 错误率
sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))

- QPS
sum(rate(http_server_requests_seconds_count[1m]))