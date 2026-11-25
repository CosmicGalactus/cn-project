# CN Project — Distributed DNS, Load-Balanced Backends, and Secure Reverse Proxy

A four-machine Computer Networks project (Phase 1 + Phase 2) demonstrating custom DNS resolution, HTTPS delivery, HTTP/2 load balancing, high-availability failover, service isolation, and controlled DNS cutover — all running on a local LAN without any cloud dependency.

---

## Team

| Machine | Member | Role |
|---------|--------|------|
| **M1** | Shrestha Gupta | Primary DNS Server + Test Client |
| **M2** | Prakhar Shrivastava | Primary Edge Reverse Proxy (Nginx + TLS + LB) |
| **M3** | Soumen Dass | Backend Server B + Backup DNS Server |
| **M4** | Rishav Devan | Backend Server A + Standby Edge + Test Client |

---

## Architecture

```
                        ┌─────────────────────────────────────────────┐
                        │         DNS Layer (UDP :53)                  │
                        │  Primary DNS (M1)  ←→  Backup DNS (M3)      │
                        │  TTL = 30s | Hot-reload from network-config  │
                        └───────────────┬─────────────────────────────┘
                                        │ app.team1.test → M2 (Primary)
                                        │                 M4 (Standby, Ext E)
                        ┌───────────────▼─────────────────────────────┐
                        │       Edge Layer (HTTP:80 → HTTPS:443)       │
                        │  Primary Nginx (M2)  ←→  Standby Nginx (M4) │
                        │  TLS 1.2/1.3 | Local CA | HTTP/2             │
                        │  Round-robin LB | max_fails=2 fail_timeout=10s│
                        └──────────┬────────────────────┬─────────────┘
                                   │                    │
              ┌────────────────────▼──┐    ┌────────────▼──────────────────┐
              │  Backend A (M4 :5001) │    │  Backend B (M3 :5002)         │
              │  X-Backend: A         │    │  X-Backend: B                 │
              │  pf firewall isolated │    │  pf firewall isolated         │
              └───────────────────────┘    └───────────────────────────────┘
```

---

## Phase 1 — What Was Built

| Task | Description | Status |
|------|-------------|--------|
| **Private LAN** | 4 Macs on same Wi-Fi, all reachable via `ping` | ✅ |
| **Custom DNS** | UDP DNS server resolving `.test` hostnames on port 53 (TTL 30s) | ✅ |
| **Backend A** | Express server on `0.0.0.0:5001` with `X-Backend: A`, `/api/status`, `304` caching | ✅ |
| **Backend B** | Express server on `0.0.0.0:5002` with `X-Backend: B`, `/api/status`, `304` caching | ✅ |
| **Nginx Edge** | HTTPS reverse proxy with HTTP→HTTPS redirect, TLS 1.2/1.3, round-robin LB | ✅ |
| **HTTP Caching** | `Cache-Control: public, max-age=60` + ETag → `304 Not Modified` demo | ✅ |
| **Local CA + TLS** | Self-signed Local CA (`ca.crt`) trusted on client Macs — no `curl -k` needed | ✅ |

---

## Phase 2 — Extensions Built & Live-Tested

### Extension A — Backup DNS (Failover DNS)
- **What:** A second DNS server (`DNS_ROLE=backup`) runs on M3 (Soumen's Mac) alongside Backend B.
- **Demo:** Primary DNS (M1) is stopped → Client Mac still resolves `app.team1.test` using Backup DNS (M3).
- **Key:** Both servers read from the same `network-config.json` — zero config duplication.

### Extension B — DNS TTL & Controlled Change
- **What:** All DNS records carry `TTL=30s`. Changing `activeEdge` in `network-config.json` on the DNS server takes effect without restart (hot-reload on every query).
- **Demo:** `app.team1.test` resolves to `10.7.2.62` (Primary Edge M2) → change `activeEdge` from `"m2"` to `"m4"` → flush DNS cache → `app.team1.test` now resolves to `10.7.26.82` (Standby Edge M4). Change back after demo.
- **Live Result:** `dig @10.7.3.54 app.team1.test +short` → `10.7.26.82` ✅

### Extension C — Service Isolation (pf Firewall)
- **What:** macOS `pf` firewall rules on M3 and M4 restrict backend ports (`:5002` and `:5001` respectively) to allow ONLY the Primary Edge IP (`10.7.2.62`) — all direct client connections are silently dropped.
- **Demo:** Firewall enabled on M3 → Rishav (M4) tries `curl http://10.7.24.85:5002/api/status` → `Connection timed out` (blocked!) ✅
- **Commands:** `soumen-pf.sh enable/status/rollback` and `rishav-pf.sh enable/status/rollback`

### Extension D — High Availability Failover + Recovery
- **What:** Nginx upstream configured with `max_fails=2 fail_timeout=10s` and `proxy_next_upstream error timeout http_502 http_503 http_504`. When one backend goes down, Nginx automatically routes 100% traffic to the healthy backend. When it recovers, load balancing resumes.
- **Demo:** Backend A stopped → 4/4 requests return `x-backend: B` ✅ → Backend A restarted → requests return `x-backend: A` and `x-backend: B` alternating ✅

### Extension E — Standby Edge + DNS Cutover
- **What:** A fully configured Standby Nginx (same `nginx.conf`, same TLS cert chain) is kept ready on M4. DNS cutover (`activeEdge: "m2"` → `"m4"`) + DNS cache flush instantly re-routes all traffic to the Standby Edge — no cert changes, no nginx restart on clients.
- **Demo:** `app.team1.test` → M2 (Primary) → change `activeEdge` → `app.team1.test` → M4 (Standby). Restored after demo.

---

## Repository Structure

```
cn-project/
├── network-config.json          ← Single source of truth: IPs, domain, ports, roles
│
├── shared/
│   └── backendServer.js         ← Shared Express backend factory (A & B both use this)
│
├── backendA/
│   └── index.js                 ← Backend A (M4 - Rishav, :5001)
│
├── backendB/
│   └── index.js                 ← Backend B (M3 - Soumen, :5002)
│
├── dns-server/
│   ├── index.js                 ← Zero-dependency UDP DNS (Primary + Backup, port 53)
│   ├── connectivity-check.js    ← DNS + TCP reachability verification utility
│   └── package.json
│
├── nginx/
│   ├── generate-nginx-conf.sh   ← Auto-generates nginx.conf from network-config.json
│   ├── generate-certs.sh        ← Generates Local CA + *.team1.test TLS certificate
│   ├── nginx.conf               ← Generated Nginx config (do not edit manually)
│   └── ssl/
│       ├── ca.crt               ← Local Root CA (trust this on each client Mac)
│       ├── server.crt           ← TLS cert (SAN: app/api/edge/standby/*.team1.test)
│       └── server.key           ← TLS private key
│
└── firewall/
    ├── lib-pf.sh                ← Shared pf firewall library
    ├── soumen-pf.sh             ← Backend B isolation (M3, port :5002)
    └── rishav-pf.sh             ← Backend A isolation (M4, port :5001)
```

---

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| `.test` domain (not `.local`) | `.local` conflicts with macOS mDNS (Bonjour) — `.test` is reserved for local testing (RFC 2606) |
| DNS port `53` (not `1053`) | macOS System DNS only queries port 53 — required for browser + system-wide `curl` demos |
| `network-config.json` as single source | All components (DNS, Nginx, Firewall) read from one file — IP changes require editing only one file |
| Zero-dependency DNS (`dgram`) | No `dns2` package needed at runtime — built-in Node.js UDP socket handles full DNS packet parsing |
| Local CA + cert (not self-signed per-host) | One CA trust per client Mac covers all `.team1.test` subdomains — no `curl -k` ever needed |
| `max_fails=2 fail_timeout=10s` | Nginx marks a backend down after 2 failures within 10s — fast passive health checks without a separate health-check endpoint |
| Hot-reload DNS from `network-config.json` | DNS server re-reads config on every query — DNS cutover (Ext E) and TTL demo (Ext B) require zero restarts |

---

## Network Topology (IPs used during demo)

| Machine | IP | Ports |
|---------|----|-------|
| M1 (Shrestha) | `10.7.3.54` | UDP `53` |
| M2 (Prakhar) | `10.7.2.62` | TCP `80`, `443` |
| M3 (Soumen) | `10.7.24.85` | TCP `5002`, UDP `53` |
| M4 (Rishav) | `10.7.26.82` | TCP `5001`, TCP `443` (standby) |

> These are DHCP-assigned IPs. Update `network-config.json` when IPs change — all other configs update automatically.

---

## Setup (Fresh Start)

### Prerequisites
- Node.js 18+ on all Macs
- Nginx (`brew install nginx`) on M2 and M4
- OpenSSL (pre-installed on macOS)
- All Macs on the same Wi-Fi / LAN

### Step 1 — Clone & update IPs
```bash
git clone https://github.com/CosmicGalactus/cn-project.git
cd cn-project
# Edit network-config.json — update m1..m4 IPs to current Wi-Fi IPs
```

### Step 2 — Generate TLS certs (once, run on M2)
```bash
./nginx/generate-certs.sh
```

### Step 3 — Trust Local CA on each client Mac (M1, M3, M4)
```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain "$(pwd)/nginx/ssl/ca.crt"
```

### Step 4 — Set Wi-Fi DNS on client Macs (M1, M3, M4)
System Settings → Wi-Fi → Details → DNS → Add:
- `10.7.3.54` (Primary DNS — M1)
- `10.7.24.85` (Backup DNS — M3)

### Step 5 — Start all services

**M1 (Shrestha) — Primary DNS:**
```bash
cd dns-server && sudo DNS_ROLE=primary DNS_PORT=53 node index.js
```

**M2 (Prakhar) — Primary Nginx Edge:**
```bash
./nginx/generate-nginx-conf.sh --role primary
sudo nginx -c "$(pwd)/nginx/nginx.conf"
```

**M3 (Soumen) — Backend B + Backup DNS:**
```bash
# Terminal 1
cd backendB && node index.js
# Terminal 2
cd dns-server && sudo DNS_ROLE=backup DNS_PORT=53 node index.js
```

**M4 (Rishav) — Backend A + Standby Nginx (keep stopped until Ext E demo):**
```bash
cd backendA && npm install && node index.js
# Standby Nginx — only start during Extension E demo:
# ./nginx/generate-nginx-conf.sh --role standby
# sudo nginx -c "$(pwd)/nginx/nginx.conf"
```

---

## Verification Commands

```bash
# DNS resolution check (from any Mac)
dig @10.7.3.54 app.team1.test +short          # → 10.7.2.62 (Prakhar)
dig @10.7.24.85 app.team1.test +short         # → 10.7.2.62 (Backup DNS)

# HTTPS + LB check (from Shrestha or Rishav)
for i in 1 2 3 4; do
  curl -si https://app.team1.test/api/status | grep -E "HTTP/|x-backend:|x-edge-node:"
done
# Expected: HTTP/2 200, x-backend: A, x-backend: B alternating

# Nginx health
curl -si https://app.team1.test/nginx-health

# 304 Not Modified caching check
ETAG=$(curl -sI https://app.team1.test/api/cache-demo | awk -F': ' 'tolower($1)=="etag"{print $2}' | tr -d '\r')
curl -si -H "If-None-Match: $ETAG" https://app.team1.test/api/cache-demo | head -1
# Expected: HTTP/2 304

# Full DNS + TCP connectivity check
cd dns-server && DNS_HOST=10.7.3.54 DNS_PORT=53 node connectivity-check.js
```

---

## Demo Scripts (Phase 2 Extensions)

### Extension A — Backup DNS failover
```bash
# Stop Primary DNS on M1 (Ctrl+C)
# From any client Mac:
dig @10.7.24.85 app.team1.test +short   # Backup DNS still resolves!
```

### Extension B — TTL & DNS cache
```bash
# On M1 (Shrestha) or M3 (Soumen) DNS server Mac:
sed -i '' 's/"activeEdge": "m2"/"activeEdge": "m4"/' network-config.json
# Flush DNS cache on client Mac:
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
dig @10.7.3.54 app.team1.test +short   # → 10.7.26.82 (Rishav!)
# Restore:
sed -i '' 's/"activeEdge": "m4"/"activeEdge": "m2"/' network-config.json
```

### Extension C — Service isolation
```bash
# On M3 (Soumen):
sudo ./firewall/soumen-pf.sh enable
# From M4 (Rishav) — direct hit (blocked!):
curl -v --connect-timeout 3 http://10.7.24.85:5002/api/status
# Restore:
sudo ./firewall/soumen-pf.sh rollback
```

### Extension D — HA Failover + Recovery
```bash
# Stop Backend A on M4 (Ctrl+C), then from any client:
for i in 1 2 3 4; do curl -si https://app.team1.test/api/status | grep "x-backend:"; done
# → All x-backend: B
# Restart Backend A → after ~10s, A and B alternate again
```

### Extension E — Standby Edge DNS cutover
```bash
# On M4 (Rishav) — start Standby Nginx:
sudo nginx -c "$(pwd)/nginx/nginx.conf"
# On DNS server Mac — point traffic to M4:
sed -i '' 's/"activeEdge": "m2"/"activeEdge": "m4"/' network-config.json
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
curl -si https://app.team1.test/nginx-health | grep x-edge-node   # → standby-m4!
# Restore after demo:
sed -i '' 's/"activeEdge": "m4"/"activeEdge": "m2"/' network-config.json
sudo nginx -c "$(pwd)/nginx/nginx.conf" -s stop   # stop standby
```

---

## Concepts Demonstrated

| Concept | Where |
|---------|-------|
| UDP DNS protocol (A record, AAAA, NXDOMAIN, NOERROR) | `dns-server/index.js` |
| DNS TTL and resolver cache | `network-config.json` → `dns.ttl: 30` |
| TCP 3-way handshake | Every `curl` to backend ports |
| TLS 1.2/1.3 handshake | Nginx `:443` with Local CA |
| HTTP/2 multiplexing | `http2 on` in `nginx.conf` |
| Reverse proxy + load balancing | Nginx `upstream backend_pool` |
| Passive health checks | `max_fails=2 fail_timeout=10s` |
| HTTP caching (ETag + 304) | `GET /api/cache-demo` on both backends |
| `Cache-Control: no-store` | `GET /api/status` — always fresh |
| Stateless DNS-based failover | Extension E (DNS cutover) |
| Network-layer firewall (`pf`) | `firewall/soumen-pf.sh`, `rishav-pf.sh` |
| Hot-config reload (zero downtime) | DNS server re-reads `network-config.json` per query |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `curl` SSL error without `-k` | Trust `nginx/ssl/ca.crt` on client Mac via `security add-trusted-cert` |
| `app.team1.test` does not resolve | Check Wi-Fi DNS settings — must point to M1 (`10.7.3.54`) or M3 (`10.7.24.85`) |
| `dig` returns old IP after `activeEdge` change | Run `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` |
| Backend shows UNREACHABLE | Check if `node index.js` is running and port not blocked by pf firewall |
| Nginx fails to start | Run `nginx -t -c "$(pwd)/nginx/nginx.conf"` to check config; ensure `ca.crt` path exists |
| pf warning "could result in flushing rules" | Normal macOS warning — rules are applied correctly despite the message |
| Firewall blocks HTTPS too | Only backend ports (`:5001`, `:5002`) are isolated — Nginx (`:443`) is not restricted |

---

## License

Academic and educational use — Rishihood University, Computer Networks Course.
