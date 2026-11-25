#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PF_LABEL="Backend B Isolation (Soumen M3)"
PF_PORT_FIELD="backendB"
PF_DEFAULT_PORT="5002"
PF_TAG="backendB"

source "$SCRIPT_DIR/lib-pf.sh"
run_pf_command "${1:-help}"
