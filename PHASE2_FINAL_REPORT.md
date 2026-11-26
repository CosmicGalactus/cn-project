# Computer Networks Course Project — Final Phase 2 Report

**Project Title:** Private Network Service Platform with High-Availability & Resilience  
**Team Members:**  
1. Shrestha Gupta (Mac 1 — Primary DNS Server + Client)  
2. Prakhar Shrivastava (Mac 2 — Primary Edge Reverse Proxy + Load Balancer)  
3. Soumen Dass (Mac 3 — Backend Server B + Backup DNS Server)  
4. Rishav Devan (Mac 4 — Backend Server A + Standby Edge + Client)  

---

## 1. What Changed From Phase 1
- **Topology Expansion:** Shifted from a 3-machine setup to a full 4-macOS distributed architecture. Backend A was moved from Mac 2 to Mac 4, making Mac 2 a pure Edge/Load-Balancing node.
- **Domain Migration:** Migrated from `.local` to `.test` (`team1.test`) to prevent mDNS / Bonjour conflicts on macOS (RFC 6762 / RFC 2606).
- **DNS Standard Port 53:** Updated DNS listeners to privileged UDP port 53 with zero external dependencies (`dgram`), allowing standard OS resolvers and browsers to query without specifying custom ports.
- **Local CA Infrastructure:** Implemented a team-wide Local Root CA (`ca.crt`) trusted in system keychains, terminating true HTTPS/TLS without requiring the insecure `-k` flag in `curl`.

---

## 2. Phase 2 Extensions: Resilience & Test Results

### Extension A — Backup DNS Resolver
- **Implementation:** Ran a secondary DNS resolver on Mac 3 (Soumen) alongside Backend B. Client machines were configured with Primary DNS (`10.7.3.54`) and Secondary DNS (`10.7.24.85`).
- **Test & Result:** Stopped the primary DNS process on Mac 1 (`Ctrl+C`). Clients immediately continued to resolve `app.team1.test` to `10.7.2.62` seamlessly via the backup resolver.
- **Key Learning:** DNS service failure halts name resolution across the entire network, whereas application server failure allows resolution to succeed while the TCP/HTTP connection fails (e.g., 502/Connection Refused).

### Extension B — DNS TTL & Controlled Record Change
- **Implementation:** Configured records with a 30-second TTL (`network-config.json`). The DNS server dynamically hot-reloads config on every query.
- **Test & Result:** Changed `app.team1.test` target IP from Mac 2 (`10.7.2.62`) to Mac 4 (`10.7.26.82`). Queried `dig`: observed that client machines retained the cached IP until the 30-second TTL expired, or until flushed manually with `dscacheutil -flushcache; killall -HUP mDNSResponder`.
- **Key Learning:** Demonstrates how production migrations depend on DNS TTL propagation and why low TTLs are configured prior to planned maintenance.

### Extension C — Service Isolation (Backend Firewall Rules)
- **Implementation:** Deployed macOS packet filter (`pf`) rules on Mac 3 and Mac 4 to drop all incoming TCP traffic on ports 5001 and 5002 unless originated from Mac 2 (Edge IP: `10.7.2.62`) or `127.0.0.1`.
- **Test & Result:** When Mac 4 directly attempted `curl http://10.7.24.85:5002/api/status`, the connection timed out (`Connection timed out`). However, requests through the Edge (`https://app.team1.test`) succeeded.
- **Key Learning:** Enforces the principle of least privilege in multi-tier networks, isolating internal backend databases/services from perimeter intrusion.

### Extension D — High-Availability Failover Behavior
- **Implementation:** Configured Nginx upstream with passive health checking: `max_fails=2 fail_timeout=10s` and `proxy_next_upstream error timeout http_502 http_503 http_504`.
- **Test & Result:** Terminated Backend A on Mac 4 (`pkill -f "node index.js"`). 100% of incoming HTTPS requests immediately and transparently routed to Backend B (`X-Backend: B`). Upon restarting Backend A, round-robin distribution (`A` -> `B` -> `A` -> `B`) resumed within 10 seconds.
- **Single Point of Failure (SPOF):** The edge Nginx instance on Mac 2 remains an SPOF. In production, this is eliminated using VRRP (Keepalived), Anycast BGP, or cloud Anycast Edge networks (e.g., AWS ALB / Cloudflare).

### Extension E — Controlled Edge Migration (DNS-Based Cutover)
- **Implementation:** Configured a Standby Nginx proxy on Mac 4 with identical TLS certificates and backend pools.
- **Test & Result:** Pointed `app.team1.test` to Mac 4 (`10.7.26.82`) in DNS and verified requests were served by Standby Edge (`x-edge-node: standby-m4`) without application downtime.

---

## 3. Systematic Troubleshooting Methodology (Extension F Preparation)
During fault injection, our team follows a strict bottom-up layer isolation process:
1. **DNS Layer:** Run `dig app.team1.test +short`. If resolution fails or returns the wrong IP, the fault is in `/etc/resolv.conf`, system DNS settings, or DNS records.
2. **Transport (TCP) Layer:** Run `nc -zv <IP> <PORT>` or `curl -v`. If connection hangs or refuses, the fault is a stopped process, incorrect port, or `pf` firewall rule.
3. **Security (TLS) Layer:** Run `openssl s_client -connect <IP>:443 -servername app.team1.test`. If certificate handshake fails, check expiration, SAN names, or CA trust store.
4. **Application Layer:** Inspect HTTP status codes (`502 Bad Gateway` = upstream backends down; `404` = incorrect routing path; `304` = cache validation).
