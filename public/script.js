let ws = null;
let currentRoom = null;

function connect() {
  ws = new WebSocket(getWsUrl());
  ws.addEventListener("open", () => {
    // noop
  });
  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "code") {
        // got a server-generated room code
        document.getElementById("room-input").value = msg.code;
      } else if (msg.type === "joined") {
        onJoined(msg.room);
      } else if (msg.type === "peer-joined") {
        setStatus("A friend joined.");
      } else if (msg.type === "peer-left") {
        setStatus("Your friend left.");
      } else if (msg.type === "message") {
        appendMessage("(friend): " + msg.text);
      } else if (msg.type === "error") {
        setStatus("Error: " + (msg.error || "unknown"));
      }
    } catch {}
  });
  ws.addEventListener("close", () => {
    setStatus("Connection closed.");
  });
}

function getWsUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

function setStatus(t) {
  document.getElementById("status").textContent = t;
}

function appendMessage(text) {
  const el = document.createElement("div");
  el.textContent = text;
  document.getElementById("messages").appendChild(el);
  document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
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

function requestCode() {
  ws.send(JSON.stringify({ type: "generateCode" }));
}

function joinWithInput() {
  const code = document.getElementById("room-input").value.trim();
  if (!code) {
    setStatus("Enter a room code.");
    return;
  }
  ws.send(JSON.stringify({ type: "join", room: code }));
}

function createRoom() {
  requestCode();
  setTimeout(() => {
    const code = document.getElementById("room-input").value.trim();
    if (code) {
      ws.send(JSON.stringify({ type: "join", room: code }));
    }
  }, 50);
}

function sendMessage() {
  const box = document.getElementById("msg");
  const text = box.value.trim();
  if (!text || !ws) return;
  ws.send(JSON.stringify({ type: "message", text }));
  appendMessage("(you): " + text);
  box.value = "";
}

function copyInvite() {
  if (!currentRoom) return;
  const url = `${location.origin}?room=${encodeURIComponent(currentRoom)}`;
  navigator.clipboard.writeText(url).then(() => setStatus("Invite link copied."));
}

function leaveRoom() {
  // Closing the tab or socket will remove us; we just refresh to teardown
  location.href = location.origin;
}

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

  // Support ?room= prefill
  const params = new URLSearchParams(location.search);
  const room = params.get("room");
  if (room) {
    document.getElementById("room-input").value = room;
  }
});
