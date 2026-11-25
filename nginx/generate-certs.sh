#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/network-config.json"
SSL_DIR="$SCRIPT_DIR/ssl"

DOMAIN="$(node -e "const c = require(process.argv[1]); console.log(c.domain || 'team1.test');" "$CONFIG_FILE")"
mkdir -p "$SSL_DIR"

CA_KEY="$SSL_DIR/ca.key"
CA_CRT="$SSL_DIR/ca.crt"
SRV_KEY="$SSL_DIR/server.key"
SRV_CSR="$SSL_DIR/server.csr"
SRV_CRT="$SSL_DIR/server.crt"
EXT_CFG="$SSL_DIR/server.ext"

if [[ ! -f "$CA_KEY" || ! -f "$CA_CRT" ]]; then
  openssl genrsa -out "$CA_KEY" 2048
  openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 825 \
    -subj "/C=IN/ST=DelhiNCR/O=CNProject/CN=CNProject Local CA ($DOMAIN)" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out "$CA_CRT"
fi

openssl genrsa -out "$SRV_KEY" 2048
openssl req -new -key "$SRV_KEY" -subj "/C=IN/ST=DelhiNCR/O=CNProject/CN=app.$DOMAIN" -out "$SRV_CSR"

cat > "$EXT_CFG" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = app.$DOMAIN
DNS.2 = api.$DOMAIN
DNS.3 = edge.$DOMAIN
DNS.4 = standby.$DOMAIN
DNS.5 = *.$DOMAIN
EOF

openssl x509 -req -in "$SRV_CSR" -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$SRV_CRT" -days 365 -sha256 -extfile "$EXT_CFG"
rm -f "$SRV_CSR" "$EXT_CFG"

openssl verify -CAfile "$CA_CRT" "$SRV_CRT"
openssl x509 -in "$SRV_CRT" -noout -subject -ext subjectAltName
