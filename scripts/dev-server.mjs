import net from "node:net";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOSTNAME || "0.0.0.0";
const guardedPorts = Array.from(new Set([port, 3000, 3001, 3002, 3003, 3004, 3005])).sort((a, b) => a - b);

function isPortAvailable(portToCheck) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(portToCheck, host);
  });
}

const occupiedPorts = [];
for (const guardedPort of guardedPorts) {
  if (!(await isPortAvailable(guardedPort))) occupiedPorts.push(guardedPort);
}

if (occupiedPorts.length > 0) {
  console.error(`\nDev server port check failed. Occupied port${occupiedPorts.length === 1 ? "" : "s"}: ${occupiedPorts.join(", ")}.`);
  console.error("Stop existing PersonalTA/Next dev servers first, then run `npm run dev` again.");
  console.error("This prevents Next.js from reusing deleted/stale dev artifacts and showing:");
  console.error("  missing required error components, refreshing...\n");
  process.exit(1);
}

const nextBin = process.platform === "win32" ? "next.cmd" : "next";
const child = spawn(nextBin, ["dev", "--port", String(port), "--hostname", host], {
  env: {
    ...process.env,
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-dev",
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
