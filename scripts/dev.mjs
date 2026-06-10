import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");

const processes = [
  {
    name: "api",
    command: process.execPath,
    args: [path.join(root, "server/src/index.js")],
    cwd: root
  },
  {
    name: "client",
    command: process.execPath,
    args: [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "0.0.0.0"],
    cwd: path.join(root, "client")
  }
];

const children = processes.map(({ name, command, args, cwd }) => {
  const child = spawn(command, args, {
    cwd,
    stdio: "pipe",
    env: process.env
  });

  child.stdout.on("data", (chunk) => writePrefixed(name, chunk));
  child.stderr.on("data", (chunk) => writePrefixed(name, chunk));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[${name}] avslutta med kode ${code}`);
    }
  });

  return child;
});

function writePrefixed(name, chunk) {
  String(chunk)
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => console.log(`[${name}] ${line}`));
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
