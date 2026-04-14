# Skill: k8s-inspect
## 功能
K8s 集群巡检、异常 Pod 查看、事件查询

## 命令
1. 集群状态
kubectl cluster-info

2. 节点状态
kubectl get nodes -o wide

3. 所有命名空间异常 Pod
kubectl get pods -A | grep -E 'Error|Pending|CrashLoopBackOff|ImagePullBackOff|OOMKilled'

4. 查看 Pod 日志
kubectl logs -n {namespace} {pod} --tail=200

5. 查看 Pod 事件
kubectl describe pod -n {namespace} {pod}