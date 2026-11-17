import { io } from "../client/node_modules/socket.io-client/build/esm/index.js";

function connect() {
  const socket = io("http://localhost:3000", { transports: ["websocket"] });
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

async function join(socket, label) {
  return new Promise((resolve) => {
    socket.emit(
      "join",
      { role: "viewer", deviceId: `cap-${label}-${Date.now()}-${Math.random()}`, userName: label },
      resolve,
    );
  });
}

const health = await fetch("http://localhost:3000/api/health").then((r) => r.json());
console.log("health", health);

const s1 = await connect();
const r1 = await join(s1, "one");
console.log("viewer1", { ok: r1.ok, count: r1.viewerCount, error: r1.error, max: r1.maxViewers });

const s2 = await connect();
const r2 = await join(s2, "two");
console.log("viewer2", { ok: r2.ok, count: r2.viewerCount, error: r2.error, message: r2.message });

s1.disconnect();
s2.disconnect();
process.exit(r1.ok && !r2.ok && r2.error === "full" ? 0 : 1);
