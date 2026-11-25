# Soumen (M3) & Rishav (M4) — Phase 1 + Phase 2 Runbook

## Soumen's Mac (M3 — `10.7.24.85`)
```bash
# Terminal 1: Backend B (:5002)
cd backendB && node index.js

# Terminal 2: Backup DNS (port 53 for demo, 1053 for local test)
cd dns-server && sudo DNS_ROLE=backup DNS_PORT=53 node index.js

# Terminal 3: Service Isolation Firewall (Extension C)
sudo ./firewall/soumen-pf.sh enable
sudo ./firewall/soumen-pf.sh allow-standby   # Extension E ke time
sudo ./firewall/soumen-pf.sh rollback        # Demo ke baad zaroor chalayein
```

## Rishav's Mac (M4 — `10.7.26.82`)
```bash
cd backendA && npm install && node index.js
brew install nginx
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$(pwd)/nginx/ssl/ca.crt"
./nginx/generate-nginx-conf.sh --role standby
sudo nginx -c "$(pwd)/nginx/nginx.conf"

# Firewall (Backend A :5001)
sudo ./firewall/rishav-pf.sh enable
sudo ./firewall/rishav-pf.sh rollback
```

## When All 4 Macs Connect on Same Wi-Fi
1. Update `m1..m4` IPs (and `domain` if needed) in `network-config.json`.
2. Shrestha (M1): `cd dns-server && sudo DNS_ROLE=primary DNS_PORT=53 node index.js`
3. Prakhar (M2): `./nginx/generate-nginx-conf.sh --role primary && sudo nginx -c "$(pwd)/nginx/nginx.conf"` + trust `nginx/ssl/ca.crt` on client Macs.
