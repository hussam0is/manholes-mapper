# Mock TSC3 Controller — Agent Skill

You control a **mock TSC3 WebSocket server** that simulates a Trimble TSC3 survey controller sending survey points to the Manholes Mapper app. Use this to test the TSC3 WebSocket adapter integration without a physical device.

---

## Quick Reference

| Component | URL / Port |
|-----------|-----------|
| WebSocket server | `ws://localhost:8765` |
| HTTP control API | `http://localhost:3001` |
| Web UI | `http://localhost:3001` |

---

## Starting / Stopping the Server

**Start:**
```bash
node scripts/mock-tsc3/server.mjs
# or
npm run mock:tsc3
```

**Start with custom ports:**
```bash
WS_PORT=9000 HTTP_PORT=4000 node scripts/mock-tsc3/server.mjs
```

**Stop:** Kill the background process or press Ctrl+C.

---

## REST API Endpoints

### `GET /api/status`
Returns server state. Use this to verify the server is running and check connected clients.
```bash
curl http://localhost:3001/api/status
```
Response: `{ "connectedClients": 0, "sentPointsCount": 0, "historyLength": 0, "wsPort": 8765, "httpPort": 3001 }`

### `POST /api/send-point`
Send a single survey point. Broadcasts CSV line to all connected WebSocket clients.
```bash
curl -X POST http://localhost:3001/api/send-point \
  -H "Content-Type: application/json" \
  -d '{"pointName":"MH1","easting":179500.000,"northing":665500.000,"elevation":25.0}'
```

### `POST /api/send-batch`
Send multiple points sequentially.
```bash
curl -X POST http://localhost:3001/api/send-batch \
  -H "Content-Type: application/json" \
  -d '[
    {"pointName":"MH1","easting":179400.000,"northing":665400.000,"elevation":20.0},
    {"pointName":"MH2","easting":179450.000,"northing":665450.000,"elevation":21.5},
    {"pointName":"MH3","easting":179500.000,"northing":665500.000,"elevation":23.0}
  ]'
```

### `GET /api/history`
List all previously sent points with timestamps.
```bash
curl http://localhost:3001/api/history
```

### `POST /api/clear-history`
Reset history and sent count.
```bash
curl -X POST http://localhost:3001/api/clear-history
```

---

## Connecting the App to the Mock Server

### Desktop (Playwright)
With `npm run dev` running on localhost:5173:
```javascript
// In Playwright browser_evaluate:
window.tsc3Connection?.connectWebSocket('localhost', 8765)
```

### Phone via ADB reverse
```bash
adb reverse tcp:8765 tcp:8765
```
Then from the app, connect to `ws://localhost:8765`.

### Phone via LAN
The server prints the LAN IP at startup. Use `ws://<LAN_IP>:8765` from the phone. The phone must be on the same WiFi network.

---

## Test Scenarios

### 1. Single point → node-type dialog
1. Start mock server
2. Connect the app via WebSocket
3. Send a point with a **new** point name:
   ```bash
   curl -X POST http://localhost:3001/api/send-point \
     -H "Content-Type: application/json" \
     -d '{"pointName":"MH1","easting":179500.000,"northing":665500.000,"elevation":25.0}'
   ```
4. **Expected:** App shows node-type selection dialog (manhole, valve, etc.)

### 2. Repeat point name → silent update
1. Send the same point name `MH1` again with different coordinates:
   ```bash
   curl -X POST http://localhost:3001/api/send-point \
     -H "Content-Type: application/json" \
     -d '{"pointName":"MH1","easting":179510.000,"northing":665510.000,"elevation":26.0}'
   ```
2. **Expected:** No dialog — existing node coordinates update silently

### 3. Batch → multiple nodes
1. Send a 3-point batch
2. **Expected:** Three sequential node-type dialogs (or three silent updates if names exist)

### 4. Connection status
1. Check `/api/status` shows `connectedClients: 0`
2. Connect app via WebSocket
3. Check `/api/status` shows `connectedClients: 1`
4. Disconnect app
5. Check `/api/status` shows `connectedClients: 0`

---

## ITM Coordinate Reference

The parser validates ITM (Israel Transverse Mercator) ranges:

| Field | Valid Range | Typical Tel Aviv Value |
|-------|-----------|----------------------|
| Easting | 100,000 – 300,000 | ~179,500 |
| Northing | 400,000 – 800,000 | ~665,500 |
| Elevation | any number | ~25 m |

Out-of-range values will be rejected by both the mock server and the app's parser.

---

## CSV Wire Format

The server sends newline-terminated CSV in NEN order:
```
MH1,179500.000,665500.000,25.000\n
```
The parser (`src/survey/tsc3-parser.js`) auto-detects delimiter (comma, tab, space) and column order (NEN vs NNE) using ITM range heuristics.

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| App connects via `wss://` but server is `ws://` | App served over HTTPS auto-upgrades to WSS | Serve app over HTTP (`npm run dev` → `http://localhost:5173`) or use ADB reverse |
| Port 8765 in use | Another process on that port | `WS_PORT=9000 node scripts/mock-tsc3/server.mjs` and connect to port 9000 |
| Port 3001 in use | Vercel dev or other process | `HTTP_PORT=4000 node scripts/mock-tsc3/server.mjs` |
| Phone can't connect via LAN | Different WiFi network or firewall | Use `adb reverse tcp:8765 tcp:8765` instead |
| Points rejected (400 error) | Coordinates outside ITM range | Use easting 100k–300k, northing 400k–800k |
