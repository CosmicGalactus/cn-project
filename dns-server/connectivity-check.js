import dgram from "dgram";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../network-config.json"), "utf8"));

const DNS_HOST = process.env.DNS_HOST || "127.0.0.1";
const DNS_PORT = Number(process.env.DNS_PORT || 1053);
const DOMAIN = config.domain || "team1.test";

function buildQuery(hostname, id = 0x1234) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2);
  header.writeUInt16BE(1, 4);

  const labels = hostname.split(".").map((label) => {
    const b = Buffer.from(label, "utf8");
    return Buffer.concat([Buffer.from([b.length]), b]);
  });
  const qtail = Buffer.alloc(4);
  qtail.writeUInt16BE(1, 0);
  qtail.writeUInt16BE(1, 2);

  return Buffer.concat([header, ...labels, Buffer.from([0]), qtail]);
}

function resolveDNS(hostname, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const client = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      client.close();
      resolve({ ok: false, error: "DNS timeout" });
    }, timeoutMs);

    client.on("message", (msg) => {
      clearTimeout(timer);
      client.close();
      if (msg.length >= 16 && msg.readUInt16BE(6) > 0) {
        const ip = msg.subarray(msg.length - 4);
        resolve({ ok: true, ip: `${ip[0]}.${ip[1]}.${ip[2]}.${ip[3]}` });
      } else {
        resolve({ ok: false, error: "No A record returned" });
      }
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      client.close();
      resolve({ ok: false, error: err.message });
    });

    client.send(buildQuery(hostname), DNS_PORT, DNS_HOST);
  });
}

function checkTCPPort(ip, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      socket.destroy();
      resolve({ ok: true });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "Connection timed out" });
    });
    socket.on("error", (err) => {
      socket.destroy();
      resolve({ ok: false, error: err.message });
    });
    socket.connect(port, ip);
  });
}

async function main() {
  console.log(`\n🔍 CN Project Check | DNS=${DNS_HOST}:${DNS_PORT} | Domain=${DOMAIN}\n`);
  const machines = config.machines || {};
  const expectedEdgeIp = machines[config.activeEdge || "m2"]?.ip;

  const dnsTargets = [
    ["App Entry", `app.${DOMAIN}`, expectedEdgeIp],
    ["API Entry", `api.${DOMAIN}`, expectedEdgeIp],
    ...Object.entries(machines).map(([k, v]) => [`${k.toUpperCase()} (${v.name.split(" ")[0]})`, `${k}.${DOMAIN}`, v.ip]),
    ["BackendA", `backenda.${DOMAIN}`, machines.m4?.ip],
    ["BackendB", `backendb.${DOMAIN}`, machines.m3?.ip],
  ];

  for (const [label, host, expected] of dnsTargets) {
    const res = await resolveDNS(host);
    if (res.ok && res.ip === expected) console.log(`✅ ${label.padEnd(18)} ${host.padEnd(24)} → ${res.ip}`);
    else if (res.ok) console.log(`⚠️  ${label.padEnd(18)} ${host.padEnd(24)} → ${res.ip} (expected ${expected})`);
    else console.log(`❌ ${label.padEnd(18)} ${host.padEnd(24)} → ${res.error}`);
  }

  console.log();
  const ports = [
    ["Backend B (Local)", "127.0.0.1", config.ports?.backendB || 5002],
    ["Backend B (LAN)", machines.m3?.ip, config.ports?.backendB || 5002],
    ["Backend A (Rishav)", machines.m4?.ip, config.ports?.backendA || 5001],
    ["Edge HTTPS (Prakhar)", machines.m2?.ip, config.ports?.https || 443],
  ];
  for (const [label, ip, port] of ports) {
    if (!ip) continue;
    const res = await checkTCPPort(ip, port);
    console.log(res.ok ? `✅ ${label.padEnd(22)} ${ip}:${port} → REACHABLE` : `ℹ️  ${label.padEnd(22)} ${ip}:${port} → ${res.error}`);
  }
  console.log();
}

main();
