/**
 * Captures the six bundled OBS overlays.
 *
 * The overlays are plain HTML that connect to a WebSocket server at
 * `127.0.0.1:9528`. This script serves the real overlay files over HTTP and
 * runs a minimal WebSocket server that speaks the same `state`/`goal`/
 * `statfeed` protocol as the Rust core, then screenshots each overlay against
 * a Rocket League–like backdrop.
 *
 * Run from `landing/`: `node scripts/capture-overlays.mjs`
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const OVERLAY_DIR = path.join(REPO, "src-tauri/overlays");
const OUT_DIR = path.join(__dirname, "../assets-src/overlays");
const FIXTURE_DIR = path.join(__dirname, "../assets-src/_backdrop");

const HTTP_PORT = 9538;
const sh = sharp;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });

// ─── Live match state in the canonical overlay contract ─────────────────────

const state = {
  matchGuid: "LND-SHOWCASE-01",
  arena: "DFH Stadium",
  isOnline: true,
  isOvertime: false,
  timeRemaining: 178,
  scoreBlue: 2,
  scoreOrange: 1,
  ballSpeed: 1412,
  playerCount: 4,
  matchType: "online",
  lastTouchTeam: 0,
  playlistId: 11,
  players: [
    { id: "p1", name: "Nico", team: 0, score: 412, goals: 1, shots: 3, assists: 1, saves: 2, touches: 48, demos: 1, speed: 2201, boost: 68 },
    { id: "p2", name: "Tomi", team: 0, score: 355, goals: 1, shots: 2, assists: 1, saves: 1, touches: 41, demos: 0, speed: 2140, boost: 52 },
    { id: "p3", name: "Kaze", team: 1, score: 388, goals: 1, shots: 4, assists: 0, saves: 3, touches: 52, demos: 2, speed: 2288, boost: 44 },
    { id: "p4", name: "Rulo", team: 1, score: 290, goals: 0, shots: 1, assists: 1, saves: 1, touches: 37, demos: 0, speed: 2105, boost: 71 },
  ],
};

// ─── Static file server for the real overlay assets ─────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);

    // Generated backdrops used to composite the overlay over gameplay.
    if (pathname.startsWith("/__backdrop/")) {
      const name = path.basename(pathname);
      const body = await readFile(path.join(FIXTURE_DIR, name));
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "no-store",
      });
      res.end(body);
      return;
    }

    // Mirror the Rust routes: /sdk/rl-overlay.js and /overlays/<name>
    if (pathname === "/sdk/rl-overlay.js") {
      pathname = "/rl-overlay-sdk.js";
    } else if (pathname.startsWith("/overlays/")) {
      pathname = pathname.slice("/overlays".length);
    } else if (pathname === "/") {
      pathname = "/index.html";
    }
    if (!path.extname(pathname)) pathname += ".html";

    const filePath = path.join(OVERLAY_DIR, path.normalize(pathname));
    if (!filePath.startsWith(OVERLAY_DIR)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

// ─── WebSocket server speaking the overlay protocol ─────────────────────────
//
// The SDK derives the WebSocket port from `location.port`, so the WS upgrade
// must be handled by the SAME HTTP server — otherwise every overlay would
// connect back to 9538 and never find the socket.

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (client) => {
    wss.emit("connection", client, request);
  });
});

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "connected", data: {} }));
  socket.send(JSON.stringify({ type: "state", data: state }));
});

// ─── Capture ────────────────────────────────────────────────────────────────

/**
 * A blurred, darkened arena still stands in for live gameplay. The overlays
 * must be composited over something for the screenshots to read as a stream;
 * a flat black canvas made every overlay look like a floating widget.
 */
async function buildBackdrop(width, height) {
  const source = path.join(REPO, "public/arenas/cs_p.webp");
  const fallback = path.join(REPO, "public/arenas/eurostadium_night_p.webp");
  const arenaPath = existsSync(source) ? source : fallback;
  const data = await sh
    ? await sh(arenaPath)
        .resize(width, height, { fit: "cover" })
        .modulate({ brightness: 0.32, saturation: 0.85 })
        .blur(6)
        .png()
        .toBuffer()
    : null;
  if (!data) return null;
  const target = path.join(FIXTURE_DIR, `backdrop-${width}x${height}.png`);
  await writeFile(target, data);
  return target;
}

const OVERLAYS = [
  // `goalDelay` waits out the goal animation (3 s + fade) so the scorebug
  // itself is visible; `alerts` keeps the alert on screen via `duration`.
  { id: "enhanced", width: 1920, height: 220, label: "enhanced", fireEvents: true, goalDelay: 4600 },
  { id: "scoreboard", width: 900, height: 200, label: "scoreboard", fireEvents: false, goalDelay: 900 },
  { id: "player-stats", width: 760, height: 420, label: "player-stats", fireEvents: false, goalDelay: 900 },
  { id: "event-feed", width: 420, height: 640, label: "event-feed", fireEvents: true, goalDelay: 1300 },
  { id: "alerts", width: 900, height: 260, label: "alerts", fireEvents: true, goalDelay: 1100, duration: 9000 },
  { id: "all-in-one", width: 1500, height: 620, label: "all-in-one", fireEvents: true, goalDelay: 1200 },
];

async function main() {
  await new Promise((resolve) => server.listen(HTTP_PORT, "127.0.0.1", resolve));

  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });

  for (const overlay of OVERLAYS) {
    const page = await context.newPage();
    await page.setViewportSize({
      width: overlay.width,
      height: overlay.height,
    });

    // Compose the real overlay over a gameplay-like backdrop so the capture
    // matches how it looks inside OBS.
    const backdrop = await buildBackdrop(overlay.width, overlay.height);
    const params = new URLSearchParams({ token: "showcase" });
    if (overlay.id === "enhanced") {
      params.set("title", "Grand Final · Game 3");
      params.set("blueName", "AZUL");
      params.set("orangeName", "NARANJA");
      params.set("series", "5");
    }
    if (overlay.duration) params.set("duration", String(overlay.duration));
    const url = `http://127.0.0.1:${HTTP_PORT}/overlays/${overlay.id}?${params.toString()}`;
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(900);

    if (backdrop) {
      await page.evaluate((src) => {
        document.documentElement.style.background = `url("${src}") center/cover no-repeat`;
        document.body.style.background = "transparent";
      }, `http://127.0.0.1:${HTTP_PORT}/__backdrop/${path.basename(backdrop)}`);
    }

    if (overlay.fireEvents) {
      // Emit a goal + statfeed so alert/event overlays have content.
      broadcast({
        type: "goal",
        data: {
          scorerId: "p1",
          scorerName: "Nico",
          teamNum: 0,
          assisterId: "p2",
          assisterName: "Tomi",
          goalSpeed: 1461,
          time: 263,
        },
      });
      broadcast({
        type: "statfeed",
        data: {
          eventName: "Save",
          mainTarget: { id: "p2", name: "Tomi", teamNum: 0 },
          secondaryTarget: null,
        },
      });
      broadcast({
        type: "statfeed",
        data: {
          eventName: "Demolish",
          mainTarget: { id: "p3", name: "Kaze", teamNum: 1 },
          secondaryTarget: { id: "p1", name: "Nico", teamNum: 0 },
        },
      });
    }
    // Re-send state so score-change pulses settle on the final value.
    broadcast({ type: "state", data: state });

    await page.waitForTimeout(overlay.goalDelay);

    await page.screenshot({
      path: path.join(OUT_DIR, `${overlay.label}.png`),
      animations: "disabled",
    });
    console.log(`[overlays] captured ${overlay.label} (${overlay.width}×${overlay.height})`);
    await page.close();
    // Alerts auto-dismiss after ~3.2s; give the layer time to clear between
    // overlays so one shot's alert never leaks into the next.
    await new Promise((r) => setTimeout(r, 3400));
  }

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  wss.close();
  console.log("[overlays] done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
