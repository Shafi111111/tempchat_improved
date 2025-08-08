const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
app.set("trust proxy", true);
const wss = new WebSocket.Server({ server });
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 40;
const ipBuckets = new Map();

function rateLimitOkay(ip) {
  const now = Date.now();
  const entry = ipBuckets.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE_LIMIT_WINDOW_MS; }
  entry.count += 1;
  ipBuckets.set(ip, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

function generateRoomCode() {
  const bytes = crypto.randomBytes(24);
  const base62 = bytes.toString("base64").replace(/[+/=]/g, "").slice(0, 30);
  return base62;
}

const HEARTBEAT_INTERVAL = 30_000;
function heartbeat() { this.isAlive = true; }

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);
  ws._room = null;
  ws._ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;

  ws.on("message", (data) => {
    if (typeof data === "string" && data.length > 4096) return;
    let msg; try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === "join") {
      if (typeof msg.room !== "string" || msg.room.length < 4 || msg.room.length > 64) {
        ws.send(JSON.stringify({ type: "error", error: "Invalid room code." })); return;
      }
      if (!rooms.has(msg.room)) rooms.set(msg.room, new Set());
      const set = rooms.get(msg.room);
      if (set.size >= 2) { ws.send(JSON.stringify({ type: "error", error: "Room is full (2 users max)." })); return; }
      set.add(ws);
      ws._room = msg.room;
      ws.send(JSON.stringify({ type: "joined", room: ws._room }));
      set.forEach((peer) => { if (peer !== ws) peer.send(JSON.stringify({ type: "peer-joined" })); });
      return;
    }

    if (msg.type === "generateCode") {
      ws.send(JSON.stringify({ type: "code", code: generateRoomCode() }));
      return;
    }

    if (!rateLimitOkay(ws._ip)) { ws.send(JSON.stringify({ type: "error", error: "Too many messages. Slow down." })); return; }

    if (msg.type === "message") {
      if (!ws._room) return;
      const set = rooms.get(ws._room); if (!set) return;
      const clean = (msg.text ?? "").toString().slice(0, 500); if (!clean) return;
      set.forEach((peer) => { if (peer !== ws && peer.readyState === WebSocket.OPEN) { peer.send(JSON.stringify({ type: "message", text: clean })); }});
      return;
    }
  });

  ws.on("close", () => {
    const r = ws._room;
    if (r && rooms.has(r)) {
      const set = rooms.get(r);
      set.delete(ws);
      set.forEach((peer) => { if (peer.readyState === WebSocket.OPEN) { peer.send(JSON.stringify({ type: "peer-left" })); }});
      if (set.size === 0) rooms.delete(r);
    }
  });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => { if (ws.isAlive === false) return ws.terminate(); ws.isAlive = false; ws.ping(); });
}, HEARTBEAT_INTERVAL);
wss.on("close", function close() { clearInterval(interval); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log("Server listening on " + PORT); });
