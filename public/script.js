let ws = null;
let currentRoom = null;
let countdownTimer = null;
let countdownRemaining = 0;

/* ---------- Connection ---------- */
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(getWsUrl());

  ws.addEventListener("open", () => {
    setStatus("Connected to server.");
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

/* ---------- Message handling ---------- */
function onMessage(ev) {
  let msg;
  try {
    msg = JSON.parse(ev.data);
  } catch {
    return;
  }

  switch (msg.type) {
    case "code":
      document.getElementById("room-input").value = msg.code;
      break;

    case "joined":
      onJoined(msg.room);
      break;

    case "peer-joined":
      cancelCountdown();
      setStatus("A friend joined.");
      break;

    case "peer-left":
      setStatus("Your friend left.");
      startCountdown(30); // 30 seconds, then return to main
      break;

    case "message":
      appendMessage("(friend)", msg.text, "you");
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

function appendMessage(who, text, cls) {
  const el = document.createElement("div");
  el.className = `msg ${cls}`;
  el.textContent = `${who}: ${text}`;
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
  setStatus("Connected to room.");
  showRoomUI(true);
  cancelCountdown();
}

function startCountdown(seconds) {
  countdownRemaining = seconds;
  const el = document.getElementById("countdown");
  el.classList.remove("hidden");
  el.textContent = `Returning to home in ${countdownRemaining}s…`;

  cancelCountdown();
  countdownTimer = setInterval(() => {
    countdownRemaining -= 1;
    if (countdownRemaining <= 0) {
      cancelCountdown();
      leaveRoom(); // return to main
    } else {
      el.textContent = `Returning to home in ${countdownRemaining}s…`;
    }
  }, 1000);
}

function cancelCountdown() {
  const el = document.getElementById("countdown");
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  el.classList.add("hidden");
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
    appendMessage("(you)", text, "me");
    box.value = "";
  });
}

function copyInvite() {
  if (!currentRoom) return;
  const url = `${location.origin}?room=${encodeURIComponent(currentRoom)}`;
  navigator.clipboard.writeText(url).then(() => setStatus("Invite link copied."));
}

function leaveRoom() {
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

  const params = new URLSearchParams(location.search);
  const room = params.get("room");
  if (room) {
    document.getElementById("room-input").value = room;
  }
});
