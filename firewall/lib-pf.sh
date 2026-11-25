#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/network-config.json"
BACKUP_DIR="$SCRIPT_DIR/backups"
GENERATED_PF="/tmp/cn-${PF_TAG}.pf.conf"

read_config_value() {
  node -e "const c = require(process.argv[1]); console.log($1);" "$CONFIG_FILE"
}

BACKEND_PORT="$(read_config_value "c.ports['$PF_PORT_FIELD'] || $PF_DEFAULT_PORT")"
EDGE_IP="$(read_config_value "c.machines.m2.ip")"
STANDBY_IP="$(read_config_value "c.machines.m4.ip")"

generate_rules() {
  local include_standby="${1:-false}"
  {
    cat /etc/pf.conf
    echo ""
    echo "# --- CN Project Phase 2 Extension C: $PF_LABEL (Port $BACKEND_PORT) ---"
    echo "pass in quick on lo0 proto tcp from 127.0.0.1 to any port $BACKEND_PORT"
    echo "pass in quick proto tcp from $EDGE_IP to any port $BACKEND_PORT"
    if [[ "$include_standby" == "true" ]]; then
      echo "pass in quick proto tcp from $STANDBY_IP to any port $BACKEND_PORT"
    fi
    echo "block drop in quick proto tcp from any to any port $BACKEND_PORT"
  } > "$GENERATED_PF"
}

save_backup() {
  mkdir -p "$BACKUP_DIR"
  if [[ ! -f "$BACKUP_DIR/pf.conf.orig" ]]; then
    cp /etc/pf.conf "$BACKUP_DIR/pf.conf.orig"
    pfctl -sr > "$BACKUP_DIR/pf-rules.orig.txt" 2>/dev/null || true
    if pfctl -s info 2>/dev/null | grep -q "Status: Enabled"; then
      echo "enabled" > "$BACKUP_DIR/pf-state.orig"
    else
      echo "disabled" > "$BACKUP_DIR/pf-state.orig"
    fi
  fi
}

require_sudo() {
  if [[ "$EUID" -ne 0 ]]; then
    echo "Run with sudo: sudo $0 $*"
    exit 1
  fi
}

run_pf_command() {
  local cmd="${1:-help}"
  case "$cmd" in
    dry-run)
      generate_rules "false"
      tail -n 6 "$GENERATED_PF"
      ;;
    enable)
      require_sudo "$@"
      save_backup
      generate_rules "false"
      pfctl -nf "$GENERATED_PF"
      pfctl -f "$GENERATED_PF"
      pfctl -e 2>/dev/null || true
      echo "Firewall enabled ($PF_LABEL): ONLY $EDGE_IP (+ localhost) allowed on port $BACKEND_PORT."
      ;;
    allow-standby)
      require_sudo "$@"
      save_backup
      generate_rules "true"
      pfctl -nf "$GENERATED_PF"
      pfctl -f "$GENERATED_PF"
      pfctl -e 2>/dev/null || true
      echo "Firewall updated (Ext E): $EDGE_IP and Standby $STANDBY_IP allowed on port $BACKEND_PORT."
      ;;
    status)
      require_sudo "$@"
      pfctl -s info | head -n 5
      pfctl -sr | grep "$BACKEND_PORT" || echo "(No custom rules for port $BACKEND_PORT)"
      ;;
    rollback)
      require_sudo "$@"
      pfctl -f /etc/pf.conf
      if [[ -f "$BACKUP_DIR/pf-state.orig" ]] && [[ "$(cat "$BACKUP_DIR/pf-state.orig")" == "disabled" ]]; then
        pfctl -d 2>/dev/null || true
      fi
      rm -f "$GENERATED_PF"
      echo "Restored original pf configuration."
      ;;
    *)
      echo "Usage: $0 {dry-run|enable|allow-standby|status|rollback}"
      ;;
  esac
}
