#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PF_LABEL="Backend A Isolation (Rishav M4)"
PF_PORT_FIELD="backendA"
PF_DEFAULT_PORT="5001"
PF_TAG="backendA"

source "$SCRIPT_DIR/lib-pf.sh"
run_pf_command "${1:-help}"
