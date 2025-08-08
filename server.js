const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

// Allow proxy-aware IP (for Render/Fly/etc.)
app.set("trust proxy", true);

const wss = new WebSocket.Server({ server });
app.use(express.static(path.join(__dirname, "public")));

// --- In-memory rooms: { code: Set<WebSocket> } ---
const rooms = new Map();

// Simple IP rate limiter: max N messages per 10s
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 40;
const ipBuckets = new Map(); // ip -> { count, resetAt }

function rateLimitOkay(ip) {
  const now = Date.now();
  const entry = ipBuckets.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count += 1;
  ipBuckets.set(ip, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

// Generate secure room codes (30 base62)
function generateRoomCode() {
  const bytes = crypto.randomBytes(24); // 24 bytes ~ 32 base62 chars; we'll slice to 30
  const base62 = bytes.toString("base64").replace(/[+/=]/g, "").slice(0, 30);
  return base62;
}

// Clean dead sockets with heartbeats
const HEARTBEAT_INTERVAL = 30_000;
function heartbeat() {
  this.isAlive = true;
}
wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  ws._room = null;
  ws._ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;

  ws.on("message", (data) => {
    // Guard: JSON + size + structure
    if (typeof data === "string" && data.length > 4096) return;
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // Join room
    if (msg.type === "join") {
      if (typeof msg.room !== "string" || msg.room.length < 4 || msg.room.length > 64) {
        ws.send(JSON.stringify({ type: "error", error: "Invalid room code." }));
        return;
      }
      // Make room if needed
      if (!rooms.has(msg.room)) rooms.set(msg.room, new Set());
      const set = rooms.get(msg.room);
      // Two users max by default
      if (set.size >= 2) {
        ws.send(JSON.stringify({ type: "error", error: "Room is full (2 users max)." }));
        return;
      }
      set.add(ws);
      ws._room = msg.room;
      ws.send(JSON.stringify({ type: "joined", room: ws._room }));
      // Notify the other peer that someone joined
      set.forEach((peer) => {
        if (peer !== ws) peer.send(JSON.stringify({ type: "peer-joined" }));
      });
      return;
    }

    // Send a server-generated code
    if (msg.type === "generateCode") {
      ws.send(JSON.stringify({ type: "code", code: generateRoomCode() }));
      return;
    }

    // Rate limit ordinary messages
    if (!rateLimitOkay(ws._ip)) {
      ws.send(JSON.stringify({ type: "error", error: "Too many messages. Slow down." }));
      return;
    }

    // Chat messages
    if (msg.type === "message") {
      if (!ws._room) return;
      const set = rooms.get(ws._room);
      if (!set) return;
      const text = (msg.text ?? "").toString();
      if (!text) return;
      const clean = text.slice(0, 500); // length cap
      // Broadcast to others only
      set.forEach((peer) => {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: "message", text: clean }));
        }
      });
      return;
    }
  });

  ws.on("close", () => {
    const r = ws._room;
    if (r && rooms.has(r)) {
      const set = rooms.get(r);
      set.delete(ws);
      // Notify remaining peer the other left
      set.forEach((peer) => {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: "peer-left" }));
        }
      });
      if (set.size === 0) rooms.delete(r);
    }
  });
});

// Ping clients to detect half-open connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on("close", function close() {
  clearInterval(interval);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server listening on " + PORT);
});
