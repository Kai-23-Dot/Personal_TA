import net from "node:net";
import { spawn } from "node:child_process";

const host = process.env.HOSTNAME || "0.0.0.0";

function isPortAvailable(portToCheck) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => { server.close(() => resolve(true)); });
    server.listen(portToCheck, host);
  });
}

// Find an available port starting from the requested one
let port = Number(process.env.PORT || 3000);
while (!(await isPortAvailable(port))) {
  port++;
}
console.log(`Starting PersonalTA dev server on port ${port}...`);

// Strip VS Code / other Next.js process variables that corrupt SWC middleware config extraction
const {
  __NEXT_PRIVATE_STANDALONE_CONFIG: _s,
  __NEXT_PRIVATE_ORIGIN: _o,
  ...cleanEnv
} = process.env;

const nextBin = process.platform === "win32" ? "next.cmd" : "next";
const child = spawn(nextBin, ["dev", "--port", String(port), "--hostname", host], {
  env: {
    ...cleanEnv,
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-dev",
    NODE_ENV: "development",
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
