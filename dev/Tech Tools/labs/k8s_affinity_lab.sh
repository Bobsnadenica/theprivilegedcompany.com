#!/bin/bash

# ==============================================================================
# Lab: The Impossible Schedule (Kubernetes Affinity)
# Goal: Identify and fix a Pod that is stuck in 'Pending' due to Affinity rules.
# ==============================================================================

set -euo pipefail

CLUSTER_NAME="lab-affinity"
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${BLUE}[LAB]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- Dependency Check ---
check_deps() {
    for tool in docker kubectl kind; do
        if ! command -v "$tool" &>/dev/null; then
            log "$tool is missing. Running global setup script..."
            if [ -f "./setup_k8s.sh" ]; then
                ./setup_k8s.sh
            else
                error "Please ensure docker, kubectl, and kind are installed."
            fi
        fi
    done
}

# --- Cleanup ---
cleanup() {
    log "Cleaning up lab cluster..."
    kind delete cluster --name "$CLUSTER_NAME"
    success "Cleanup complete."
}

# --- Main Lab Setup ---
setup() {
    check_deps
    
    log "Bootstrapping lab cluster: $CLUSTER_NAME..."
    kind create cluster --name "$CLUSTER_NAME"
    
    log "Deploying the 'Broken' workload..."
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: affinity-mystery
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mystery
  template:
    metadata:
      labels:
        app: mystery
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: topology.kubernetes.io/zone
                operator: In
                values:
                - us-east-1a
      containers:
      - name: nginx
        image: nginx:alpine
EOF

    echo -e "\n${YELLOW}==================================================${NC}"
    echo -e "${YELLOW}               LAB IS LIVE                      ${NC}"
    echo -e "${YELLOW}==================================================${NC}"
    echo -e "Problem: The 'affinity-mystery' deployment is stuck."
    echo -e "1. Run: ${BLUE}kubectl get pods${NC}"
    echo -e "2. Inspect: ${BLUE}kubectl describe pod -l app=mystery${NC}"
    echo -e "3. Goal: Make the pod run without changing the Deployment YAML."
    echo -e "   (Hint: Look at node labels)"
    echo -e "4. When done, run: ${BLUE}$0 cleanup${NC}"
    echo -e "==================================================\n"
}

# --- Router ---
if [[ "${1:-}" == "cleanup" ]]; then
    cleanup
else
    setup
fi
