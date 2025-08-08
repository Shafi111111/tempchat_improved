# Ephemeral Chat (no database)

Two-person, room-code chat. No messages are stored; when both tabs close, the room disappears.

## Local dev
```bash
npm install
npm start
# open http://localhost:3000
```

## Deploy (pick one)

### 1) Render (free web service, sleeps when idle)
- Create a new **Web Service** from your Git repo.
- **Build Command:** `npm install`
- **Start Command:** `node server.js`
- **Port:** 3000 (auto-detected)
- Add a free web service. WebSockets are supported.
- Note: the instance may sleep; waking can take a few seconds.

### 2) Fly.io (free small VM, good WebSocket support)
- Install `flyctl` and run:
```bash
fly launch --no-deploy
# accept generated fly.toml
fly deploy
```
- App will be available at `https://<your-app>.fly.dev`.

### 3) Replit (quick demo)
- Create a new Node.js repl, upload files, `npm install`, then Run.
- Turn on "Always On" if available, or expect sleep.

### 4) Railway (trial quota)
- Create a new project from repo.
- Set start command `node server.js`.
- Deploy.

### 5) Cloudflare (advanced)
Cloudflare Pages alone can’t run a Node server, but **Cloudflare Workers / Durable Objects** can do WebSockets. Porting this server to Workers is possible, but code changes are needed. If you want this path, ask and I’ll convert it.

## Config
- Max **2 users / room** (change in `server.js`).
- Basic **rate limit** per IP.
- Heartbeats to clean dead sockets.
- No persistence by design.

## Security notes
- No auth; anyone with the code can join.
- Messages are not stored server-side, but transit through the server. Use HTTPS in production.
