#!/bin/bash

# ==============================================================================
# Lab: The Silent Service (Networking)
# Goal: Debug why traffic isn't reaching your Pods.
# ==============================================================================

set -euo pipefail

CLUSTER_NAME="lab-service"
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
    
    log "Deploying workloads..."
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-server
  template:
    metadata:
      labels:
        app: web-server
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
---
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  selector:
    app: webserver  # Mismatch: missing the hyphen
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
EOF

    echo -e "\n${YELLOW}==================================================${NC}"
    echo -e "${YELLOW}               LAB IS LIVE                      ${NC}"
    echo -e "${YELLOW}==================================================${NC}"
    echo -e "Problem: The 'web-service' is not sending traffic to pods."
    echo -e "1. Check endpoints: ${BLUE}kubectl get endpoints web-service${NC}"
    echo -e "2. Compare: Service selector vs Pod labels."
    echo -e "3. Goal: Fix the Service so it has endpoints."
    echo -e "4. When done, run: ${BLUE}$0 cleanup${NC}"
    echo -e "==================================================\n"
}

# --- Router ---
if [[ "${1:-}" == "cleanup" ]]; then
    cleanup
else
    setup
fi
