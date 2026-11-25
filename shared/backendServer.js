import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../network-config.json");

export function loadNetworkConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function getLocalIPv4(fallbackIp = "127.0.0.1") {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return fallbackIp;
}

/**
 * Starts a standardized CN Project backend HTTP server on 0.0.0.0.
 */
export function startBackendServer(express, options) {
  const { id, machineKey, owner, defaultPort, portField } = options;
  const config = loadNetworkConfig();
  const port = Number(process.env.PORT || config?.ports?.[portField] || defaultPort);
  const host = "0.0.0.0";
  const fallbackIp = config?.machines?.[machineKey]?.ip || "127.0.0.1";
  const machineLabel = `${machineKey.toUpperCase()} - ${owner}`;

  const app = express();

  app.use((req, res, next) => {
    res.set("X-Backend", id);
    res.set("X-Backend-Owner", `${owner} (${machineKey.toUpperCase()})`);
    next();
  });

  // Deterministic root endpoint (Cache-Control + ETag 304 support)
  app.get("/", (req, res) => {
    res.set("Cache-Control", "public, max-age=60");
    res.json({
      message: `Hello from Backend Server ${id}`,
      backend: id,
      machine: machineLabel,
      ip: getLocalIPv4(fallbackIp),
      port,
      domain: config?.domain || "team1.test",
    });
  });

  // Mandatory status endpoint (never stale-cached)
  app.get("/api/status", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      backend: id,
      status: "ok",
      machine: machineLabel,
      ip: getLocalIPv4(fallbackIp),
      port,
      timestamp: new Date().toISOString(),
    });
  });

  // Dedicated deterministic endpoint for HTTP 304 Not Modified demo
  app.get("/api/cache-demo", (req, res) => {
    res.set("Cache-Control", "public, max-age=60");
    res.json({
      backend: id,
      cacheable: true,
      maxAgeSeconds: 60,
      note: "Send If-None-Match with ETag header to observe 304 Not Modified",
    });
  });

  app.get("/health", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(200).json({ status: "healthy", backend: id });
  });

  const server = app.listen(port, host, () => {
    const localIp = getLocalIPv4(fallbackIp);
    console.log(`\n🚀 Backend Server ${id} (${machineLabel})`);
    console.log(`   Listening : http://${host}:${port}`);
    console.log(`   LAN IP    : http://${localIp}:${port}`);
    console.log(`   Endpoints : /, /api/status, /api/cache-demo, /health\n`);
  });

  function shutdown(signal) {
    console.log(`\n🛑 Backend ${id} received ${signal}, shutting down gracefully...`);
    server.close(() => process.exit(0));
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return server;
}
