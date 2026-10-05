import dns2 from "dns2";

const { Packet } = dns2;

// ====================================================
//  DNS Records — Machine & Service Hostname Mappings
// ====================================================
const DNS_RECORDS = {
  // Machine hostnames
  "m1.cnproject.local":        "10.7.8.86",       // M1 — Shreshtha
  "m2.cnproject.local":        "10.7.28.103",     // M2 — Prakhar
  "m3.cnproject.local":        "10.7.6.34",       // M3 — Soumen

  // Friendly name hostnames
  "shreshtha.cnproject.local": "10.7.8.86",
  "prakhar.cnproject.local":   "10.7.28.103",
  "soumen.cnproject.local":    "10.7.6.34",

  // Backend service hostnames
  "backenda.cnproject.local":  "10.7.28.103",     // backendA → M2 (port 5001)
  "backendb.cnproject.local":  "10.7.6.34",       // backendB → M3 (port 5002)
};

const DNS_PORT = 1053;

// ====================================================
//  Create DNS Server
// ====================================================
const server = dns2.createServer({
  udp: true,
  handle: (request, send, rinfo) => {
    const response = Packet.createResponseFromRequest(request);

    for (const question of request.questions) {
      const { name, type } = question;
      const normalizedName = name.toLowerCase();

      console.log(
        `[${new Date().toLocaleTimeString()}] 📨 Query: ${name} (Type: ${type}) from ${rinfo.address}:${rinfo.port}`
      );

      if (type === Packet.TYPE.A && DNS_RECORDS[normalizedName]) {
        const ip = DNS_RECORDS[normalizedName];
        console.log(`  ✅ Resolved: ${name} → ${ip}`);

        response.answers.push({
          name,
          type: Packet.TYPE.A,
          class: Packet.CLASS.IN,
          ttl: 300,
          address: ip,
        });
      } else {
        console.log(`  ❌ No record found for: ${name}`);
      }
    }

    send(response);
  },
});

// ====================================================
//  Start Server
// ====================================================
server.on("requestError", (error) => {
  console.error("[DNS] Request error:", error);
});

server.on("listening", () => {
  console.log(`\n🌐 ════════════════════════════════════════════════`);
  console.log(`   DNS Server running on port ${DNS_PORT}`);
  console.log(`   ════════════════════════════════════════════════`);
  console.log(`\n📋 Registered DNS Records:`);
  console.log(`   ─────────────────────────────────────────────`);
  for (const [hostname, ip] of Object.entries(DNS_RECORDS)) {
    console.log(`   ${hostname.padEnd(35)} → ${ip}`);
  }
  console.log(`   ─────────────────────────────────────────────`);
  console.log(`\n🧪 Test with:`);
  console.log(`   dig @127.0.0.1 -p ${DNS_PORT} m2.cnproject.local`);
  console.log(`   dig @127.0.0.1 -p ${DNS_PORT} prakhar.cnproject.local`);
  console.log(`   dig @127.0.0.1 -p ${DNS_PORT} backenda.cnproject.local\n`);
});

server.listen({ udp: DNS_PORT });
