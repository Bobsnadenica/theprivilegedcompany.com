#!/bin/bash

# ==============================================================================
# Lab: The Silent Service (Networking)
# Goal: Debug why traffic isn't reaching your Pods.
# ==============================================================================

set -euo pipefail
umask 077

CLUSTER_NAME="lab-service"
LAB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LAB_KUBECONFIG="$LAB_DIR/.$CLUSTER_NAME.kubeconfig"
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
            error "$tool is missing. Install prerequisites from https://kind.sigs.k8s.io/docs/user/quick-start/ and review their setup instructions."
        fi
    done
}

# --- Cleanup ---
cleanup() {
    command -v kind >/dev/null || error "kind is required for cleanup."
    [ -f "$LAB_KUBECONFIG" ] || error "No lab kubeconfig found beside this script; refusing to delete an unverified cluster."
    log "Deleting only local lab cluster: $CLUSTER_NAME"
    kind delete cluster --name "$CLUSTER_NAME" --kubeconfig "$LAB_KUBECONFIG"
    rm -f -- "$LAB_KUBECONFIG"
    success "Cleanup complete."
}

# --- Main Lab Setup ---
setup() {
    check_deps
    
    docker info >/dev/null 2>&1 || error "Start your local Docker engine before running this lab."
    if kind get clusters | grep -Fxq "$CLUSTER_NAME"; then
        error "Cluster $CLUSTER_NAME already exists. Reuse it or clean up your own lab first."
    fi
    [ ! -e "$LAB_KUBECONFIG" ] || error "A previous lab kubeconfig exists. Review it before starting a new lab."
    log "Creating local containers for $CLUSTER_NAME. Images use network, disk and memory."
    kind create cluster --name "$CLUSTER_NAME" --kubeconfig "$LAB_KUBECONFIG" --wait 120s
    
    log "Deploying workloads..."
    cat <<EOF | kubectl --kubeconfig "$LAB_KUBECONFIG" --context "kind-$CLUSTER_NAME" apply -f -
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
    echo -e "1. Check endpoints: ${BLUE}kubectl --kubeconfig \"$LAB_KUBECONFIG\" get endpointslices -l kubernetes.io/service-name=web-service${NC}"
    echo -e "2. Compare: Service selector vs Pod labels."
    echo -e "3. Goal: Fix the Service so it has endpoints."
    echo -e "4. When done, run: ${BLUE}$0 cleanup${NC}"
    echo -e "==================================================\n"
}

# --- Router ---
case "${1:-setup}" in
    setup) setup ;;
    cleanup) cleanup ;;
    *) error "Usage: bash $0 [setup|cleanup]" ;;
esac
