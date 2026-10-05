import dns2 from "dns2";
import net from "net";

// ====================================================
//  Configuration
// ====================================================
const DNS_PORT = 1053;
const DNS_HOST = "127.0.0.1";

const MACHINES = {
  "M1 (Shreshtha)": { hostname: "m1.cnproject.local", ip: "10.7.8.86" },
  "M2 (Prakhar)":   { hostname: "m2.cnproject.local", ip: "10.7.28.103" },
  "M3 (Soumen)":    { hostname: "m3.cnproject.local", ip: "10.7.6.34" },
};

const SERVICES = {
  "BackendA (M2:5001)": { hostname: "backenda.cnproject.local", ip: "10.7.28.103", port: 5001 },
  "BackendB (M3:5002)": { hostname: "backendb.cnproject.local", ip: "10.7.6.34",   port: 5002 },
};

// ====================================================
//  Utilities
// ====================================================
const dns = new dns2({
  nameServers: [`${DNS_HOST}`],
  port: DNS_PORT,
});

async function resolveDNS(hostname) {
  try {
    const result = await dns.resolveA(hostname);
    if (result.answers.length > 0) {
      return { ok: true, ip: result.answers[0].address };
    }
    return { ok: false, error: "No A record returned" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function checkTCPPort(ip, port, timeoutMs = 3000) {
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

// ====================================================
//  Main Check
// ====================================================
async function main() {
  console.log(`\n🔍 ═══════════════════════════════════════════════════════`);
  console.log(`    DNS & Connectivity Check`);
  console.log(`    DNS Server: ${DNS_HOST}:${DNS_PORT}`);
  console.log(`   ═══════════════════════════════════════════════════════\n`);

  // --------------------------------------------------
  //  1. DNS Resolution Checks
  // --------------------------------------------------
  console.log(`📡 DNS Resolution Checks:`);
  console.log(`   ─────────────────────────────────────────────────────`);

  let allDnsOk = true;
  for (const [label, { hostname, ip: expectedIp }] of Object.entries(MACHINES)) {
    const result = await resolveDNS(hostname);
    if (result.ok && result.ip === expectedIp) {
      console.log(`   ✅ ${label.padEnd(20)} ${hostname.padEnd(30)} → ${result.ip}`);
    } else if (result.ok) {
      console.log(`   ⚠️  ${label.padEnd(20)} ${hostname.padEnd(30)} → ${result.ip} (expected ${expectedIp})`);
      allDnsOk = false;
    } else {
      console.log(`   ❌ ${label.padEnd(20)} ${hostname.padEnd(30)} → FAILED: ${result.error}`);
      allDnsOk = false;
    }
  }

  // Also check service hostnames
  for (const [label, { hostname, ip: expectedIp }] of Object.entries(SERVICES)) {
    const result = await resolveDNS(hostname);
    if (result.ok && result.ip === expectedIp) {
      console.log(`   ✅ ${label.padEnd(20)} ${hostname.padEnd(30)} → ${result.ip}`);
    } else if (result.ok) {
      console.log(`   ⚠️  ${label.padEnd(20)} ${hostname.padEnd(30)} → ${result.ip} (expected ${expectedIp})`);
      allDnsOk = false;
    } else {
      console.log(`   ❌ ${label.padEnd(20)} ${hostname.padEnd(30)} → FAILED: ${result.error}`);
      allDnsOk = false;
    }
  }
  console.log();

  // --------------------------------------------------
  //  2. IP Reachability (TCP ping to backend ports)
  // --------------------------------------------------
  console.log(`🔌 Backend Service Connectivity:`);
  console.log(`   ─────────────────────────────────────────────────────`);

  for (const [label, { ip, port }] of Object.entries(SERVICES)) {
    const result = await checkTCPPort(ip, port);
    if (result.ok) {
      console.log(`   ✅ ${label.padEnd(25)} ${ip}:${port}  → REACHABLE`);
    } else {
      console.log(`   ❌ ${label.padEnd(25)} ${ip}:${port}  → UNREACHABLE (${result.error})`);
    }
  }

  // --------------------------------------------------
  //  3. Summary
  // --------------------------------------------------
  console.log(`\n   ═══════════════════════════════════════════════════════`);
  if (allDnsOk) {
    console.log(`   ✅ All DNS records resolved correctly!`);
  } else {
    console.log(`   ⚠️  Some DNS records had issues — check above.`);
  }
  console.log(`   ═══════════════════════════════════════════════════════\n`);

  process.exit(0);
}

main();
