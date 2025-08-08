// public/script.js
let ws = null;
let currentRoom = null;

/* ---------- Connection ---------- */
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(getWsUrl());

  ws.addEventListener("open", () => {
    // Connected
  });

  ws.addEventListener("message", onMessage);

  ws.addEventListener("close", () => {
    setStatus("Connection closed.");
  });
}

function getWsUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

/* Wait for socket to open before sending */
function whenSocketOpen(cb) {
  connect();
  if (ws.readyState === WebSocket.OPEN) return cb();
  const onOpen = () => {
    ws.removeEventListener("open", onOpen);
    cb();
  };
  ws.addEventListener("open", onOpen);
}

/* ---------- Messaging ---------- */
function onMessage(ev) {
  let msg;
  try {
    msg = JSON.parse(ev.data);
  } catch {
    return;
  }

  switch (msg.type) {
    case "code":
      // Server-generated room code
      document.getElementById("room-input").value = msg.code;
      break;

    case "joined":
      onJoined(msg.room);
      break;

    case "peer-joined":
      setStatus("A friend joined.");
      break;

    case "peer-left":
      setStatus("Your friend left.");
      break;

    case "message":
      appendMessage("(friend): " + msg.text);
      break;

    case "error":
      setStatus("Error: " + (msg.error || "unknown"));
      break;
  }
}

/* ---------- UI helpers ---------- */
function setStatus(t) {
  document.getElementById("status").textContent = t;
}

function appendMessage(text) {
  const el = document.createElement("div");
  el.textContent = text;
  const box = document.getElementById("messages");
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function showRoomUI(show) {
  document.getElementById("setup").classList.toggle("hidden", show);
  document.getElementById("room").classList.toggle("hidden", !show);
}

function onJoined(room) {
  currentRoom = room;
  document.getElementById("room-code").textContent = "Room: " + room;
  setStatus("Connected.");
  showRoomUI(true);
}

/* ---------- Actions ---------- */
function requestCode() {
  whenSocketOpen(() => {
    ws.send(JSON.stringify({ type: "generateCode" }));
  });
}

function joinWithInput() {
  const code = document.getElementById("room-input").value.trim();
  if (!code) return setStatus("Enter a room code.");
  setStatus("Joining…");
  whenSocketOpen(() => {
    ws.send(JSON.stringify({ type: "join", room: code }));
  });
}

function createRoom() {
  // Ask server for a secure code, then join it
  requestCode();
  setTimeout(() => {
    const code = document.getElementById("room-input").value.trim();
    if (code) {
      whenSocketOpen(() => {
        ws.send(JSON.stringify({ type: "join", room: code }));
      });
    }
  }, 80);
}

function sendMessage() {
  const box = document.getElementById("msg");
  const text = box.value.trim();
  if (!text) return;

  whenSocketOpen(() => {
    ws.send(JSON.stringify({ type: "message", text }));
    appendMessage("(you): " + text);
    box.value = "";
  });
}

function copyInvite() {
  if (!currentRoom) return;
  const url = `${location.origin}?room=${encodeURIComponent(currentRoom)}`;
  navigator.clipboard.writeText(url).then(() => setStatus("Invite link copied."));
}

function leaveRoom() {
  // Easiest teardown: reload to reset state and close socket
  location.href = location.origin;
}

/* ---------- Init ---------- */
window.addEventListener("load", () => {
  connect();

  document.getElementById("new-room").addEventListener("click", createRoom);
  document.getElementById("join-room").addEventListener("click", joinWithInput);

  document.getElementById("send").addEventListener("click", sendMessage);
  document.getElementById("msg").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  document.getElementById("copy-link").addEventListener("click", copyInvite);
  document.getElementById("leave").addEventListener("click", leaveRoom);

  // Support ?room= prefill for invite links
  const params = new URLSearchParams(location.search);
  const room = params.get("room");
  if (room) {
    document.getElementById("room-input").value = room;
  }
});
