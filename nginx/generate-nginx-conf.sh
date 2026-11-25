#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/network-config.json"
OUT_CONF="$SCRIPT_DIR/nginx.conf"
LOG_DIR="$SCRIPT_DIR/logs"

ROLE="primary"
HTTP_PORT=80
HTTPS_PORT=443

while [[ $# -gt 0 ]]; do
  case "$1" in
    --role) ROLE="${2:?Missing role}"; shift 2 ;;
    --alt-ports) HTTP_PORT=8080; HTTPS_PORT=8443; shift ;;
    *) echo "Usage: $0 [--role primary|standby] [--alt-ports]"; exit 1 ;;
  esac
done

read_cfg() {
  node -e "const c = require(process.argv[1]); console.log($1);" "$CONFIG_FILE"
}

DOMAIN="$(read_cfg "c.domain || 'team1.test'")"
DNS_IP="$(read_cfg "c.machines.m1.ip")"
BACKEND_A_IP="$(read_cfg "c.machines.m4.ip")"
BACKEND_A_PORT="$(read_cfg "c.ports.backendA || 5001")"
BACKEND_B_IP="$(read_cfg "c.machines.m3.ip")"
BACKEND_B_PORT="$(read_cfg "c.ports.backendB || 5002")"
EDGE_LABEL="$([[ "$ROLE" == "standby" ]] && echo "standby-m4" || echo "primary-m2")"
REDIRECT_TARGET="$([[ "$HTTPS_PORT" == "443" ]] && echo "https://\$host\$request_uri" || echo "https://\$host:$HTTPS_PORT\$request_uri")"

mkdir -p "$LOG_DIR"

cat > "$OUT_CONF" <<EOF
worker_processes 1;
pid $LOG_DIR/nginx.pid;

events {
    worker_connections 1024;
}

http {
    resolver $DNS_IP valid=30s;
    access_log $LOG_DIR/access.log;
    error_log  $LOG_DIR/error.log;

    upstream backend_pool {
        server $BACKEND_A_IP:$BACKEND_A_PORT max_fails=2 fail_timeout=10s;
        server $BACKEND_B_IP:$BACKEND_B_PORT max_fails=2 fail_timeout=10s;
    }

    server {
        listen       $HTTP_PORT;
        server_name  app.$DOMAIN api.$DOMAIN edge.$DOMAIN standby.$DOMAIN;
        return 301   $REDIRECT_TARGET;
    }

    server {
        listen       $HTTPS_PORT ssl;
        http2        on;
        server_name  app.$DOMAIN api.$DOMAIN edge.$DOMAIN standby.$DOMAIN;

        ssl_certificate     $SCRIPT_DIR/ssl/server.crt;
        ssl_certificate_key $SCRIPT_DIR/ssl/server.key;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        add_header X-Edge-Node "$EDGE_LABEL" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options DENY always;

        location / {
            proxy_pass         http://backend_pool;
            proxy_set_header   Host              \$host;
            proxy_set_header   X-Real-IP         \$remote_addr;
            proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto \$scheme;
            proxy_next_upstream error timeout http_502 http_503 http_504;
            proxy_connect_timeout 3s;
            proxy_read_timeout    15s;
        }

        location /nginx-health {
            default_type application/json;
            return 200 '{"status":"ok","edge":"$EDGE_LABEL","domain":"$DOMAIN"}';
        }
    }
}
EOF

echo "Generated $OUT_CONF ($EDGE_LABEL, HTTP:$HTTP_PORT, HTTPS:$HTTPS_PORT)"
