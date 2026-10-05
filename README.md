# CN Project — DNS Setup & Connectivity Guide

## 🖥️ Machine Map

| Machine | IP Address    | Person    | Role                      |
|---------|---------------|-----------|---------------------------|
| **M1**  | `10.7.8.86`   | Shreshtha | DNS Server                |
| **M2**  | `10.7.28.103` | Prakhar   | BackendA (Express, :5001) |
| **M3**  | `10.7.6.34`   | Soumen    | BackendB (Express, :5002) |

## 📁 Project Structure

```
cn-project/
├── dns-server/          ← Runs on M1 (your machine)
│   ├── index.js              DNS server (port 1053)
│   ├── connectivity-check.js Verifies DNS + IP reachability
│   └── package.json
├── backendA/            ← Runs on M2 (Prakhar)
│   └── index.js              Express server on port 5001
└── backendB/            ← Runs on M3 (Soumen)
    └── index.js              Express server on port 5002
```

## 🚀 Setup Instructions

### Step 1 — On M1 (Your Machine): Start the DNS Server

```bash
cd dns-server
npm install
node index.js
```

The DNS server starts on **port 1053** and resolves these hostnames:

| Hostname                     | Resolves To     |
|------------------------------|-----------------|
| `m1.cnproject.local`         | `10.7.8.86`     |
| `m2.cnproject.local`         | `10.7.28.103`   |
| `m3.cnproject.local`         | `10.7.6.34`     |
| `shreshtha.cnproject.local`  | `10.7.8.86`     |
| `prakhar.cnproject.local`    | `10.7.28.103`   |
| `soumen.cnproject.local`     | `10.7.6.34`     |
| `backenda.cnproject.local`   | `10.7.28.103`   |
| `backendb.cnproject.local`   | `10.7.6.34`     |

### Step 2 — On M2 (Prakhar): Start BackendA

```bash
cd backendA
npm install
node index.js
```

Server A runs on `0.0.0.0:5001` (accessible from all machines on the network).

### Step 3 — On M3 (Soumen): Start BackendB

```bash
cd backendB
npm install
node index.js
```

Server B runs on `0.0.0.0:5002` (accessible from all machines on the network).

### Step 4 — Verify Everything (from M1)

```bash
# Test DNS resolution
dig @127.0.0.1 -p 1053 m2.cnproject.local
dig @127.0.0.1 -p 1053 backendb.cnproject.local

# Run full connectivity check
cd dns-server
npm run check
```

**Expected output when everything is connected:**
```
📡 DNS Resolution Checks:
   ✅ M1 (Shreshtha)       m1.cnproject.local             → 10.7.8.86
   ✅ M2 (Prakhar)         m2.cnproject.local             → 10.7.28.103
   ✅ M3 (Soumen)          m3.cnproject.local             → 10.7.6.34
   ✅ BackendA (M2:5001)   backenda.cnproject.local       → 10.7.28.103
   ✅ BackendB (M3:5002)   backendb.cnproject.local       → 10.7.6.34

🔌 Backend Service Connectivity:
   ✅ BackendA (M2:5001)        10.7.28.103:5001  → REACHABLE
   ✅ BackendB (M3:5002)        10.7.6.34:5002    → REACHABLE
```

### Step 5 — Test Backend Responses (from M1)

```bash
# Hit backendA on M2
curl http://10.7.28.103:5001/

# Hit backendB on M3
curl http://10.7.6.34:5002/
```

## ⚠️ Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend shows **UNREACHABLE** | Make sure Prakhar/Soumen have started their servers |
| `dig` returns no answer | DNS server isn't running — restart with `node index.js` |
| Firewall blocking | On M2/M3, allow inbound TCP on ports 5001/5002 |
| Backends only on localhost | Already fixed — servers now bind to `0.0.0.0` |
