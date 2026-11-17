import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { getEmojiRule } from "./emojiRules.js";
import { createToken, ensureRoom, isLiveKitConfigured } from "./livekitToken.js";
import type { ClientRole, DonationEvent, FacePoints } from "./types.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const MAX_VIEWERS = Number(process.env.MAX_VIEWERS ?? 50);
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
const INITIAL_BALANCE = 1000;

const balances = new Map<string, number>();
const viewerSockets = new Map<string, string>(); // socketId -> deviceId
const hostSockets = new Set<string>();
const donationLog: DonationEvent[] = [];
let sessionTotal = 0;
let latestFace: FacePoints = {
  side: { x: 0.2, y: 0.45 },
  sideRight: { x: 0.8, y: 0.45 },
  sideRightUp: { x: 0.8, y: 0.32 },
  sideRightDown: { x: 0.8, y: 0.58 },
  center: { x: 0.5, y: 0.45 },
  mouth: { x: 0.5, y: 0.58 },
  forehead: { x: 0.5, y: 0.28 },
  below: { x: 0.5, y: 0.75 },
  above: { x: 0.5, y: 0.15 },
  detected: false,
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    maxViewers: MAX_VIEWERS,
    viewerCount: viewerSockets.size,
    livekitConfigured: isLiveKitConfigured(),
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    maxViewers: MAX_VIEWERS,
    viewerCount: viewerSockets.size,
    publicUrl: PUBLIC_URL,
    livekitConfigured: isLiveKitConfigured(),
  });
});

app.get("/api/livekit-token", async (req, res) => {
  try {
    const role = (req.query.role as ClientRole) ?? "viewer";
    const identity = String(req.query.identity ?? randomUUID());
    const name = String(req.query.name ?? role);

    if (role === "viewer" && viewerSockets.size >= MAX_VIEWERS) {
      res.status(403).json({ error: "full", message: `ただいま満員です（${MAX_VIEWERS}人）` });
      return;
    }

    if (!isLiveKitConfigured()) {
      res.status(503).json({
        error: "not_configured",
        message: "LiveKit が未設定です。server/.env を確認してください。",
      });
      return;
    }

    await ensureRoom(MAX_VIEWERS + 1);
    const token = await createToken({
      identity,
      name,
      canPublish: role === "host",
    });
    res.json(token);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "token_failed",
      message: error instanceof Error ? error.message : "token failed",
    });
  }
});

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
    next();
    return;
  }
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

function normalizeUserName(raw?: string): string {
  return (raw || "ゲスト").trim().slice(0, 20) || "ゲスト";
}

function balanceKey(deviceId: string, userName: string): string {
  return `${deviceId}::${userName}`;
}

function getOrCreateBalance(key: string): number {
  if (!balances.has(key)) {
    balances.set(key, INITIAL_BALANCE);
  }
  return balances.get(key)!;
}

function roomSnapshot() {
  return {
    maxViewers: MAX_VIEWERS,
    viewerCount: viewerSockets.size,
    sessionTotal,
    donations: donationLog.slice(-30),
    face: latestFace,
    publicUrl: PUBLIC_URL,
    livekitConfigured: isLiveKitConfigured(),
  };
}

function broadcastRoom() {
  io.emit("room:update", roomSnapshot());
}

io.on("connection", (socket) => {
  let role: ClientRole | null = null;
  let deviceId: string | null = null;
  let userName = "";

  socket.emit("room:update", roomSnapshot());

  socket.on("join", (payload: { role: ClientRole; deviceId?: string; userName?: string }, ack?) => {
    try {
      role = payload.role;

      if (role === "host") {
        hostSockets.add(socket.id);
        socket.join("hosts");
        ack?.({ ok: true, ...roomSnapshot() });
        broadcastRoom();
        return;
      }

      if (viewerSockets.size >= MAX_VIEWERS) {
        ack?.({
          ok: false,
          error: "full",
          message: `ただいま満員です（${MAX_VIEWERS}人）`,
          ...roomSnapshot(),
        });
        return;
      }

      deviceId = payload.deviceId || randomUUID();
      userName = normalizeUserName(payload.userName);
      viewerSockets.set(socket.id, deviceId);
      socket.join("viewers");

      const balance = getOrCreateBalance(balanceKey(deviceId, userName));
      ack?.({
        ok: true,
        deviceId,
        userName,
        balance,
        ...roomSnapshot(),
      });
      broadcastRoom();
    } catch (error) {
      ack?.({
        ok: false,
        error: "join_failed",
        message: error instanceof Error ? error.message : "join failed",
      });
    }
  });

  socket.on("donate", (payload: { amount: number; userName?: string }, ack?) => {
    if (role !== "viewer" || !deviceId || !userName) {
      ack?.({ ok: false, error: "not_viewer", message: "視聴者のみ寄付できます" });
      return;
    }

    const amount = Number(payload.amount);
    const rule = getEmojiRule(amount);
    if (!rule) {
      ack?.({ ok: false, error: "invalid_amount", message: "100ポイント単位で指定してください" });
      return;
    }

    const key = balanceKey(deviceId, userName);
    const balance = getOrCreateBalance(key);
    if (amount > balance) {
      ack?.({ ok: false, error: "insufficient", message: "ポイントが足りません", balance });
      return;
    }

    const nextBalance = balance - amount;
    balances.set(key, nextBalance);
    sessionTotal += amount;

    const event: DonationEvent = {
      id: randomUUID(),
      deviceId,
      userName,
      amount,
      emoji: rule.emoji,
      effectId: rule.effectId,
      anchors: rule.anchors,
      createdAt: Date.now(),
    };
    donationLog.push(event);
    if (donationLog.length > 100) donationLog.shift();

    io.emit("donation", event);
    socket.emit("balance", { balance: nextBalance });
    broadcastRoom();
    ack?.({ ok: true, balance: nextBalance, donation: event });
  });

  socket.on("face:update", (points: FacePoints) => {
    if (role !== "host") return;
    latestFace = points;
    socket.to("viewers").emit("face:update", points);
    socket.to("hosts").emit("face:update", points);
  });

  socket.on("disconnect", () => {
    if (role === "viewer") {
      viewerSockets.delete(socket.id);
      broadcastRoom();
    }
    if (role === "host") {
      hostSockets.delete(socket.id);
      broadcastRoom();
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Max viewers: ${MAX_VIEWERS}`);
  console.log(`LiveKit configured: ${isLiveKitConfigured()}`);
  console.log(`Public URL: ${PUBLIC_URL}`);
});
