#!/bin/bash

# ==============================================================================
# Kubernetes Environment Automator
# Optimized for: macOS, Ubuntu/Debian, and WSL2
# ==============================================================================

set -euo pipefail

# --- Configuration & Colors ---
LOG_FILE="k8s_setup.log"
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# --- UI Helpers ---
log() { echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"; exit 1; }

header() {
    clear
    echo -e "${BLUE}${BOLD}==================================================${NC}"
    echo -e "${BLUE}${BOLD}   KUBERNETES ENVIRONMENT AUTOMATOR v2.0          ${NC}"
    echo -e "${BLUE}${BOLD}==================================================${NC}"
    echo -e "System: $(uname -s) | User: $(whoami) | Date: $(date +'%Y-%m-%d')"
    echo -e "Logging to: $LOG_FILE\n"
}

# --- Pre-flight Checks ---
check_os() {
    case "$(uname -s)" in
        Darwin)  OS="mac" ;;
        Linux)   OS="linux" ;;
        *)       error "Unsupported Operating System." ;;
    esac
}

check_internet() {
    log "Checking internet connectivity..."
    if ! ping -c 1 google.com &>/dev/null; then
        error "No internet connection detected."
    fi
}

# --- Dependency Management ---
is_installed() {
    command -v "$1" &>/dev/null
}

# --- Installation Modules ---

install_docker() {
    if is_installed docker; then
        success "Docker is already available."
        return
    fi

    log "Installing Docker..."
    if [[ "$OS" == "mac" ]]; then
        brew install --cask docker
    else
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker "$USER"
        warn "Docker installed. You may need to logout/login to run docker without sudo."
    fi
}

install_kubectl() {
    if is_installed kubectl; then
        success "kubectl is already available."
        return
    fi

    log "Installing kubectl..."
    if [[ "$OS" == "mac" ]]; then
        brew install kubectl
    else
        local latest_version=$(curl -L -s https://dl.k8s.io/release/stable.txt)
        curl -LO "https://dl.k8s.io/release/$latest_version/bin/linux/amd64/kubectl"
        sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
        rm kubectl
    fi
}

install_kind() {
    if is_installed kind; then
        success "kind is already available."
        return
    fi

    log "Installing kind..."
    if [[ "$OS" == "mac" ]]; then
        brew install kind
    else
        curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.22.0/kind-linux-amd64
        chmod +x ./kind
        sudo mv ./kind /usr/local/bin/kind
    fi
}

install_helm() {
    if is_installed helm; then
        success "Helm is already available."
        return
    fi

    log "Installing Helm..."
    if [[ "$OS" == "mac" ]]; then
        brew install helm
    else
        curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    fi
}

install_k9s() {
    if is_installed k9s; then
        success "k9s is already available."
        return
    fi

    log "Installing k9s (CLI Dashboard)..."
    if [[ "$OS" == "mac" ]]; then
        brew install derailed/k9s/k9s
    else
        # Install via binary for linux
        local latest_k9s=$(curl -s https://api.github.com/repos/derailed/k9s/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
        curl -Lo k9s.tar.gz "https://github.com/derailed/k9s/releases/download/$latest_k9s/k9s_Linux_amd64.tar.gz"
        tar -xzf k9s.tar.gz k9s
        sudo mv k9s /usr/local/bin/
        rm k9s.tar.gz
    fi
}

# --- Main Logic ---

main() {
    header
    check_os
    check_internet

    echo -e "${BOLD}Select components to install/audit:${NC}"
    echo -e "1) [Mandatory] Docker + kubectl + Kind"
    echo -e "2) [Recommended] Helm + k9s"
    echo -e "3) All of the above"
    echo -e "4) Exit"
    echo -n "Choice: "
    read -r choice

    case $choice in
        1)
            install_docker
            install_kubectl
            install_kind
            ;;
        2)
            install_helm
            install_k9s
            ;;
        3)
            install_docker
            install_kubectl
            install_kind
            install_helm
            install_k9s
            ;;
        4)
            exit 0
            ;;
        *)
            error "Invalid selection."
            ;;
    esac

    echo -e "\n${BLUE}==================================================${NC}"
    echo -e "${GREEN}${BOLD}AUDIT COMPLETE${NC}"
    echo -e "Current versions:"
    is_installed docker && docker --version
    is_installed kubectl && kubectl version --client --short 2>/dev/null || kubectl version --client
    is_installed kind && kind --version
    is_installed helm && helm version --short
    is_installed k9s && k9s version | grep "Version"
    echo -e "${BLUE}==================================================${NC}"
    log "Setup finished. If this is your first time, RESTART your terminal."
}

# Trap errors
trap 'error "An unexpected error occurred at line $LINENO. Check $LOG_FILE for details."' ERR

main
