# CN Project — Distributed DNS, Services, and Secure Reverse Proxy

A three-machine Computer Networks project that demonstrates service discovery, network reachability, load balancing, and HTTPS delivery on a local network. The system combines a custom DNS server with two independent Express backends and an Nginx reverse proxy.

## Objective

Build and validate a small distributed service environment in which machines can be reached by meaningful hostnames, backend services remain independently deployable, and client traffic can be served securely through a single HTTPS entry point.

## What the project demonstrates

- Custom UDP DNS resolution for machine and service hostnames
- Two Express backends exposed to the local network
- TCP connectivity checks for both backend services
- Nginx reverse proxying and upstream load balancing
- HTTP-to-HTTPS redirection and TLS configuration
- Basic cache and response-identification headers for observing backend behavior

## Architecture

```text
                         DNS queries (UDP :1053)
  Client / verifier ──────────────────────────────► M1: Custom DNS server
       │                                               │
       │ HTTPS (:443)                                  ├─ m2.cnproject.local → M2
       ▼                                               └─ m3.cnproject.local → M3
 M2: Nginx reverse proxy
       │
       ├────────────────────────► BackendA on M2 (:5001)
       └────────────────────────► BackendB on M3 (:5002)
```

## Machine responsibilities

| Machine | Owner | IP address | Work completed | Services |
| --- | --- | --- | --- | --- |
| **M1** | Shreshtha | `10.7.8.86` | Defined the project DNS zone, hostname records, and the DNS/connectivity verification workflow. | Custom DNS server on UDP `1053` |
| **M2** | Prakhar | `10.7.28.103` | Implemented BackendA and configured Nginx as the HTTPS entry point, reverse proxy, and load-balancing layer. | Express BackendA on `5001`; Nginx on `80`/`443` |
| **M3** | Soumen | `10.7.6.34` | Implemented BackendB as the second network-accessible service in the backend pool. | Express BackendB on `5002` |

> The IP addresses above are the lab-network addresses used for this project. Update the DNS records, connectivity-check configuration, and Nginx upstream configuration if your network uses different addresses.

## DNS records

The DNS server provides A records for both machines and services:

| Hostname | Address | Purpose |
| --- | --- | --- |
| `m1.cnproject.local` / `shreshtha.cnproject.local` | `10.7.8.86` | DNS server machine |
| `m2.cnproject.local` / `prakhar.cnproject.local` | `10.7.28.103` | Nginx and BackendA machine |
| `m3.cnproject.local` / `soumen.cnproject.local` | `10.7.6.34` | BackendB machine |
| `backenda.cnproject.local` | `10.7.28.103` | BackendA service |
| `backendb.cnproject.local` | `10.7.6.34` | BackendB service |

## Repository layout

```text
cn-project/
├── dns-server/
│   ├── index.js                 # UDP DNS server and A-record mappings
│   └── connectivity-check.js    # DNS and backend TCP verification utility
├── backendA/
│   └── index.js                 # Express service for M2, port 5001
├── backendB/
│   └── index.js                 # Express service for M3, port 5002
└── nginx/
    ├── nginx.conf               # HTTPS reverse-proxy and backend pool config
    └── ssl/                     # TLS certificate and private-key files
```

## Prerequisites

- Three machines connected to the same network
- Node.js 18+ and npm on M1, M2, and M3
- Nginx installed on M2
- Network/firewall rules that permit UDP `1053`, TCP `5001`, TCP `5002`, TCP `80`, and TCP `443` as appropriate
- A trusted TLS certificate for the hostname used by Nginx, or a development certificate for local testing

## Setup

### 1. Prepare all machines

Clone the repository on every participating machine, then install dependencies only for the component that machine runs.

```bash
git clone https://github.com/CosmicGalactus/cn-project.git
cd cn-project
```

### 2. Start the DNS server on M1

```bash
cd dns-server
npm install
node index.js
```

The DNS server listens on UDP port `1053`. Keep this process running while testing the environment.

### 3. Start BackendA on M2

```bash
cd backendA
npm install
node index.js
```

BackendA binds to `0.0.0.0:5001`, allowing the other machines on the network to reach it. A successful request returns JSON identifying **M2 / BackendA** and includes the `X-Backend: A` response header.

### 4. Start BackendB on M3

```bash
cd backendB
npm install
node index.js
```

BackendB binds to `0.0.0.0:5002`. A successful request returns JSON identifying **M3 / BackendB** and includes the `X-Backend: B` response header.

### 5. Configure and start Nginx on M2

Before starting Nginx, update the certificate paths in `nginx/nginx.conf` so they point to the certificate and key on M2. The supplied configuration:

- redirects HTTP traffic on port `80` to HTTPS;
- terminates TLS on port `443`;
- forwards requests to BackendA and BackendB through the `backend_pool` upstream;
- retries the other backend for eligible upstream errors; and
- exposes `GET /nginx-health` for a basic proxy health response.

Validate and start Nginx using the commands appropriate for your installation, for example:

```bash
nginx -t -c /absolute/path/to/cn-project/nginx/nginx.conf
nginx -c /absolute/path/to/cn-project/nginx/nginx.conf
```

## Walkthrough and verification

Run the following checks after all services are running.

### Verify DNS resolution from M1

```bash
dig @127.0.0.1 -p 1053 m2.cnproject.local A
dig @127.0.0.1 -p 1053 backenda.cnproject.local A
dig @127.0.0.1 -p 1053 backendb.cnproject.local A
```

Each query should return the corresponding address from the DNS records table.

### Run the full connectivity check from M1

```bash
cd dns-server
npm run check
```

This utility confirms that machine and service hostnames resolve to the expected IPs, then tests TCP reachability to `M2:5001` and `M3:5002`.

### Test the backends directly

```bash
curl http://10.7.28.103:5001/
curl http://10.7.6.34:5002/
```

The responses should identify BackendA and BackendB respectively.

### Test the HTTPS entry point

Once the client can resolve the M2 hostname through the project DNS configuration, send requests through Nginx:

```bash
curl -i https://prakhar.cnproject.local/
curl -i https://prakhar.cnproject.local/nginx-health
```

For a self-signed development certificate, use `curl -k` only for local testing. Repeated requests to `/` can be inspected through the `X-Backend` header to observe which backend handled a request.

## Troubleshooting

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| `dig` returns no answer | DNS server is not running or the wrong port is queried. | Start `dns-server/index.js` and query port `1053`. |
| Connectivity check reports a backend as unreachable | Backend process is stopped, IP is incorrect, or a firewall blocks the port. | Start the correct backend, verify the IP configuration, and allow inbound TCP `5001`/`5002`. |
| Backend works locally but not from another machine | The service is bound only to localhost or the network blocks traffic. | Confirm it binds to `0.0.0.0` and review firewall rules. |
| Nginx cannot start | Certificate paths or configuration are invalid. | Update the TLS file paths and run `nginx -t` before starting it. |
| HTTPS certificate warning | A self-signed or untrusted certificate is in use. | Trust the development CA/certificate or use a certificate trusted by the client. |

## Contribution guidelines

1. Create a focused branch for each change.
2. Keep machine addresses, DNS records, and Nginx upstream targets consistent when changing the topology.
3. Test DNS resolution and backend connectivity before submitting a change.
4. Validate Nginx configuration with `nginx -t` when modifying proxy or TLS settings.
5. Document any new hostname, port, environment requirement, or machine responsibility in this README.

## License

This project is intended for academic and educational use.
