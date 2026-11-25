import dgram from "dgram";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../network-config.json");

const DNS_ROLE = (process.env.DNS_ROLE || "backup").toUpperCase();
const DNS_PORT = Number(process.env.DNS_PORT || 1053);
const BIND_HOST = process.env.DNS_HOST || "0.0.0.0";

const TYPE_A = 1;
const TYPE_AAAA = 28;
const CLASS_IN = 1;

let lastValidConfig = null;

function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    lastValidConfig = parsed;
    return parsed;
  } catch (err) {
    if (lastValidConfig) return lastValidConfig;
    throw err;
  }
}

function buildRecords(config) {
  const domain = (config.domain || "team1.test").toLowerCase();
  const machines = config.machines || {};
  const activeEdgeIp = machines[config.activeEdge || "m2"]?.ip;
  const standbyEdgeIp = machines[config.standbyEdge || "m4"]?.ip;
  const records = {};

  if (activeEdgeIp) {
    records[`app.${domain}`] = activeEdgeIp;
    records[`api.${domain}`] = activeEdgeIp;
  }
  if (machines.m2?.ip) records[`edge.${domain}`] = machines.m2.ip;
  if (standbyEdgeIp) records[`standby.${domain}`] = standbyEdgeIp;

  for (const [key, info] of Object.entries(machines)) {
    if (!info?.ip) continue;
    records[`${key.toLowerCase()}.${domain}`] = info.ip;
    if (info.alias) records[`${info.alias.toLowerCase()}.${domain}`] = info.ip;
  }

  if (machines.m4?.ip) records[`backenda.${domain}`] = machines.m4.ip;
  if (machines.m3?.ip) records[`backendb.${domain}`] = machines.m3.ip;

  if (config.extraRecords && typeof config.extraRecords === "object") {
    for (const [host, ip] of Object.entries(config.extraRecords)) {
      records[host.toLowerCase()] = ip;
    }
  }

  return records;
}

function parseQuestion(packet) {
  if (packet.length < 12) return null;
  let offset = 12;
  const labels = [];

  while (offset < packet.length) {
    const len = packet[offset];
    if (len === 0) {
      offset += 1;
      break;
    }
    if ((len & 0xc0) !== 0 || offset + 1 + len > packet.length) return null;
    labels.push(packet.subarray(offset + 1, offset + 1 + len).toString("utf8"));
    offset += 1 + len;
  }

  if (offset + 4 > packet.length) return null;
  return {
    qname: labels.join("."),
    qtype: packet.readUInt16BE(offset),
    qclass: packet.readUInt16BE(offset + 2),
    questionSlice: packet.subarray(12, offset + 4),
  };
}

function ipv4ToBuffer(ip) {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return Buffer.from(parts);
}

function buildResponse(request, question, answerIp, ttl, rcode) {
  const header = Buffer.alloc(12);
  request.copy(header, 0, 0, 2);

  const reqFlags = request.readUInt16BE(2);
  const respFlags = 0x8000 | (reqFlags & 0x7800) | 0x0400 | (reqFlags & 0x0100) | (rcode & 0x0f);
  header.writeUInt16BE(respFlags, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(answerIp ? 1 : 0, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  if (!answerIp) return Buffer.concat([header, question.questionSlice]);

  const answer = Buffer.alloc(16);
  answer.writeUInt16BE(0xc00c, 0);
  answer.writeUInt16BE(TYPE_A, 2);
  answer.writeUInt16BE(CLASS_IN, 4);
  answer.writeUInt32BE(ttl, 6);
  answer.writeUInt16BE(4, 10);
  ipv4ToBuffer(answerIp).copy(answer, 12);

  return Buffer.concat([header, question.questionSlice, answer]);
}

function typeLabel(qtype) {
  if (qtype === TYPE_A) return "A";
  if (qtype === TYPE_AAAA) return "AAAA";
  return `TYPE(${qtype})`;
}

const server = dgram.createSocket("udp4");

server.on("message", (msg, rinfo) => {
  const question = parseQuestion(msg);
  if (!question) return;

  const config = loadConfig();
  const records = buildRecords(config);
  const ttl = Number(process.env.DNS_TTL || config?.dns?.ttl || 30);
  const matchedIp = records[question.qname.toLowerCase()];
  const time = new Date().toLocaleTimeString();

  if (matchedIp && question.qtype === TYPE_A && question.qclass === CLASS_IN) {
    console.log(
      `[${time}] [${DNS_ROLE} DNS] 📨 ${question.qname} (A) from ${rinfo.address}:${rinfo.port} → ✅ ${matchedIp} (TTL=${ttl}s)`
    );
    server.send(buildResponse(msg, question, matchedIp, ttl, 0), rinfo.port, rinfo.address);
    return;
  }

  if (matchedIp) {
    console.log(
      `[${time}] [${DNS_ROLE} DNS] 📨 ${question.qname} (${typeLabel(question.qtype)}) from ${rinfo.address}:${rinfo.port} → ⚪ NOERROR`
    );
    server.send(buildResponse(msg, question, null, ttl, 0), rinfo.port, rinfo.address);
    return;
  }

  console.log(
    `[${time}] [${DNS_ROLE} DNS] 📨 ${question.qname} (${typeLabel(question.qtype)}) from ${rinfo.address}:${rinfo.port} → ❌ NXDOMAIN`
  );
  server.send(buildResponse(msg, question, null, ttl, 3), rinfo.port, rinfo.address);
});

server.on("error", (err) => {
  if (err.code === "EACCES") {
    console.error(`\n❌ Permission denied on port ${DNS_PORT}. Use sudo for port 53 or DNS_PORT=1053.\n`);
  } else {
    console.error("[DNS] Server error:", err);
  }
  process.exit(1);
});

server.on("listening", () => {
  const config = loadConfig();
  const records = buildRecords(config);
  const ttl = Number(process.env.DNS_TTL || config?.dns?.ttl || 30);
  console.log(`\n🌐 [${DNS_ROLE} DNS] Listening on ${BIND_HOST}:${DNS_PORT} (UDP) | TTL=${ttl}s`);
  for (const [host, ip] of Object.entries(records)) {
    console.log(`   ${host.padEnd(28)} → ${ip}`);
  }
  console.log();
});

server.bind(DNS_PORT, BIND_HOST);
