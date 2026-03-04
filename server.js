const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const port = process.env.PORT || 3000;
let deviceBase = process.env.DEVICE_BASE_URL || "";
let led = false;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function generatePixels() {
  const pixels = [];
  const hotspotX = Math.floor(Math.random() * 8);
  const hotspotY = Math.floor(Math.random() * 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const dx = x - hotspotX;
      const dy = y - hotspotY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const temp = 24 + Math.max(0, 8 - dist * 2) + Math.random() * 2 - 1;
      pixels.push(Number(clamp(temp, 20, 40).toFixed(2)));
    }
  }
  return pixels;
}

function sendJson(res, obj) {
  const data = Buffer.from(JSON.stringify(obj));
  res.writeHead(200, { "Content-Type": "application/json", "Content-Length": data.length });
  res.end(data);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type =
    ext === ".html"
      ? "text/html"
      : ext === ".css"
      ? "text/css"
      : ext === ".js"
      ? "application/javascript"
      : ext === ".png"
      ? "image/png"
      : "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function httpGetJson(target, cb) {
  try {
    const parsed = url.parse(target);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
      },
      (r) => {
        let data = "";
        r.on("data", (c) => (data += c));
        r.on("end", () => {
          try {
            cb(null, JSON.parse(data));
          } catch (e) {
            cb(new Error("invalid json"));
          }
        });
      }
    );
    req.on("error", (e) => cb(e));
    req.setTimeout(3000, () => {
      req.abort();
      cb(new Error("timeout"));
    });
  } catch (e) {
    cb(e);
  }
}

function mapThermalPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.pixels)) return payload.pixels;
  return null;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === "/") {
    serveFile(res, path.join(__dirname, "newIndex.html"));
    return;
  }
  if (parsed.pathname === "/mode") {
    sendJson(res, { mode: deviceBase ? "device" : "simulator", deviceBase: deviceBase || null });
    return;
  }
  if (parsed.pathname === "/config") {
    if (Object.prototype.hasOwnProperty.call(parsed.query, "deviceBase")) {
      const incoming = String(parsed.query.deviceBase || "").trim();
      if (!incoming) {
        deviceBase = "";
      } else if (/^https?:\/\//i.test(incoming)) {
        deviceBase = incoming.replace(/\/+$/, "");
      }
    }
    sendJson(res, { mode: deviceBase ? "device" : "simulator", deviceBase: deviceBase || null });
    return;
  }
  if (parsed.pathname === "/data") {
    if (deviceBase) {
      const endpoint = deviceBase.replace(/\/+$/, "") + "/thermal";
      httpGetJson(endpoint, (err, payload) => {
        if (err) {
          sendJson(res, { pixels: generatePixels(), led: led });
          return;
        }
        const arr = mapThermalPayload(payload);
        if (!arr || arr.length !== 64) {
          sendJson(res, { pixels: generatePixels(), led: led });
          return;
        }
        sendJson(res, { pixels: arr, led: led });
      });
    } else {
      sendJson(res, { pixels: generatePixels(), led: led });
    }
    return;
  }
  if (parsed.pathname === "/control") {
    const state = String(parsed.query.state || "").toLowerCase();
    if (!state) {
      sendJson(res, { led: led });
      return;
    }
    if (deviceBase) {
      const endpoint = deviceBase.replace(/\/+$/, "") + "/led?state=" + encodeURIComponent(state);
      httpGetJson(endpoint, () => {
        if (state === "on") led = true;
        else if (state === "off") led = false;
        sendJson(res, { led: led });
      });
    } else {
      if (state === "on") led = true;
      else if (state === "off") led = false;
      sendJson(res, { led: led });
    }
    return;
  }
  const safePath = path.normalize(parsed.pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);
  if (filePath.indexOf(__dirname) !== 0) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    serveFile(res, filePath);
  });
});

server.listen(port, () => {
  console.log("Server listening at http://localhost:" + port);
});
