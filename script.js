// ─── STATE ────────────────────────────────────────────────────
let threshold    = CONFIG.DEFAULT_THRESHOLD;
let pollInterval = CONFIG.POLL_INTERVAL_MS;
let pollTimer    = null;

let histMax = [], histAvg = [], histMin = [], histEWI = [], histExcess = [];
let allTimeMin = Infinity, allTimeMax = -Infinity;
let allTimeSum = 0, allTimeCount = 0;
let peakEver   = -Infinity;

let alertLog   = [];
let totalAlerts = 0;
let lastAlertMs = 0;
let alertFiring = false;

let lastFrameMs  = Date.now();
let lastTemps    = [];
let lastData     = {};

let criticalPopupShown = false;

// ─── BUILD HEATMAP CELLS ──────────────────────────────────────
function buildHeatmap(id, large) {
  const el = document.getElementById(id);
  if (!el) return;
  for (let i = 0; i < 64; i++) {
    const c = document.createElement("div");
    c.className = "hm-cell";
    if (large) {
      c.addEventListener("mouseover", () => showInspector(i));
      c.addEventListener("mouseleave", hideInspector);
    }
    el.appendChild(c);
  }
}

buildHeatmap("heatmap-mini", false);
buildHeatmap("heatmap-full", true);

const miniCells = document.getElementById("heatmap-mini").querySelectorAll(".hm-cell");
const fullCells = document.getElementById("heatmap-full").querySelectorAll(".hm-cell");

// ─── CELL COLOR ───────────────────────────────────────────────
function getColor(t) {
  if (t < 20) return "#1e3a5f";
  if (t < 24) return "#2563eb";
  if (t < 28) return "#3b82f6";
  if (t < 30) return "#22c55e";
  if (t < 32) return "#eab308";
  if (t < 35) return "#f97316";
  const x = Math.min((t - 35) / 20, 1);
  const r = Math.round(239 + x * 16);
  const g = Math.round(68 * (1 - x));
  return `rgb(${r},${g},60)`;
}

// ─── NAVIGATION ───────────────────────────────────────────────
function navigate(page, el) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  el.classList.add("active");
  if (page === "history")  drawMainGraph();
  if (page === "energy")   drawEnergyGraph();
}

// ─── PIXEL INSPECTOR ─────────────────────────────────────────
function showInspector(idx) {
  if (!lastTemps.length) return;
  const t   = lastTemps[idx];
  const row = Math.floor(idx / 8) + 1;
  const col = (idx % 8) + 1;

  // Per-pixel radiated power
  const radW   = CONFIG.EMISSIVITY * CONFIG.SIGMA * CONFIG.PIXEL_AREA_M2 * Math.pow(t + 273.15, 4);
  const baseW  = CONFIG.EMISSIVITY * CONFIG.SIGMA * CONFIG.PIXEL_AREA_M2 * Math.pow(CONFIG.BASELINE_TEMP + 273.15, 4);
  const excessW = Math.max(0, radW - baseW);

  document.getElementById("inspector-box").innerHTML = `
    <div class="inspector-data">
      <div class="inspector-row"><span class="dim">Pixel</span><span class="accent">#${idx}</span></div>
      <div class="inspector-row"><span class="dim">Row / Col</span><span>${row} / ${col}</span></div>
      <div class="inspector-row"><span class="dim">Temperature</span>
        <span style="color:${getColor(t)};font-weight:700">${t.toFixed(2)}°C</span></div>
      <div class="inspector-row"><span class="dim">Radiated Power</span>
        <span class="accent">${radW.toFixed(4)} W</span></div>
      <div class="inspector-row"><span class="dim">Excess Power</span>
        <span style="color:var(--hot)">${excessW.toFixed(4)} W</span></div>
      <div class="inspector-row"><span class="dim">Status</span>
        <span>${t >= threshold
          ? '<span style="color:var(--accent2)">⚠ ABOVE THRESHOLD</span>'
          : '<span style="color:var(--accent)">OK</span>'}</span></div>
    </div>`;
}

function hideInspector() {
  document.getElementById("inspector-box").innerHTML =
    '<span class="mono dim">Hover over a cell</span>';
}

// ─── ROW AVERAGES ─────────────────────────────────────────────
function updateRowAvgs(temps) {
  const container = document.getElementById("row-avgs");
  if (!container) return;
  container.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    const row = temps.slice(r * 8, r * 8 + 8);
    const avg = row.reduce((a, b) => a + b, 0) / 8;
    const pct = Math.max(0, Math.min(100, ((avg - 20) / 30) * 100));
    const div = document.createElement("div");
    div.className = "row-avg-bar";
    div.innerHTML = `
      <span class="row-avg-label">ROW ${r + 1}</span>
      <div class="row-avg-track">
        <div class="row-avg-fill" style="width:${pct}%;background:${getColor(avg)}"></div>
      </div>
      <span class="row-avg-val">${avg.toFixed(1)}°C</span>`;
    container.appendChild(div);
  }
}

// ─── GENERIC GRAPH DRAW ───────────────────────────────────────
function drawGraph(canvasId, H, dataLines, yLabel) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const W = canvas.offsetWidth || 700;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const hasData = dataLines.some(d => d.data.length >= 2);
  ctx.fillStyle = "rgba(255,255,255,0.015)";
  ctx.fillRect(0, 0, W, H);

  if (!hasData) {
    ctx.fillStyle = "#4a6275";
    ctx.font = "11px 'Share Tech Mono'";
    ctx.textAlign = "center";
    ctx.fillText("Waiting for data...", W / 2, H / 2);
    return;
  }

  const allVals = dataLines.flatMap(d => d.data);
  if (threshold !== undefined) allVals.push(threshold);
  const minY = Math.min(...allVals) - 1;
  const maxY = Math.max(...allVals) + 1;
  const pad  = 34;

  const toX = i  => pad + (i / (CONFIG.MAX_HISTORY - 1)) * (W - pad * 2);
  const toY = v  => H - pad - ((v - minY) / (maxY - minY)) * (H - pad * 2);

  // Grid
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = pad + (g / 4) * (H - pad * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    const label = (maxY - (g / 4) * (maxY - minY)).toFixed(1);
    ctx.fillStyle = "#4a6275";
    ctx.font = "9px 'Share Tech Mono'";
    ctx.textAlign = "right";
    ctx.fillText(label + (yLabel || "°"), pad - 4, y + 3);
  }

  // Threshold dashed line (only on temp graph)
  if (yLabel === "°" || !yLabel) {
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(255,201,77,0.55)";
    ctx.lineWidth = 1.5;
    const ty = toY(threshold);
    ctx.beginPath(); ctx.moveTo(pad, ty); ctx.lineTo(W - pad, ty); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw each line
  dataLines.forEach(({ data, color, fill, width }) => {
    if (data.length < 2) return;

    if (fill) {
      ctx.beginPath();
      data.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
      ctx.lineTo(toX(data.length - 1), H - pad);
      ctx.lineTo(toX(0), H - pad);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }

    ctx.beginPath();
    data.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
    ctx.strokeStyle = color;
    ctx.lineWidth   = width || 1.5;
    ctx.stroke();
  });
}

function drawMainGraph() {
  drawGraph("main-graph", 220, [
    { data: histMin, color: "#4a9eff" },
    { data: histAvg, color: "#00e5c4", fill: "rgba(0,229,196,0.05)", width: 2 },
    { data: histMax, color: "#ef4444" },
  ], "°");
}

function drawMiniGraph() {
  drawGraph("mini-graph", 90, [
    { data: histMin, color: "#4a9eff" },
    { data: histAvg, color: "#00e5c4", fill: "rgba(0,229,196,0.04)", width: 2 },
    { data: histMax, color: "#ef4444" },
  ], "°");
}

function drawEnergyGraph() {
  drawGraph("energy-graph", 200, [
    { data: histExcess, color: "#f97316", fill: "rgba(249,115,22,0.08)", width: 2 },
  ], "W");
  drawGraph("ewi-graph", 160, [
    { data: histEWI, color: "#a855f7", fill: "rgba(168,85,247,0.07)", width: 2 },
  ], "%");
}

// ─── THRESHOLD ────────────────────────────────────────────────
function updateThreshold(val) {
  threshold = parseFloat(val);
  document.getElementById("threshold-display").textContent = threshold + "°C";
  drawMainGraph(); drawMiniGraph();
}

// ─── POLL INTERVAL ────────────────────────────────────────────
function updatePollInterval(val) {
  pollInterval = parseInt(val);
  document.getElementById("poll-display").textContent = pollInterval + "ms";
  clearInterval(pollTimer);
  pollTimer = setInterval(updateThermal, pollInterval);
}

// ─── ALERTS ───────────────────────────────────────────────────
function addAlertLog(msg) {
  const t = new Date().toLocaleTimeString();
  alertLog.unshift({ time: t, msg });
  if (alertLog.length > 100) alertLog.pop();
  renderAlertLog();
}

function renderAlertLog() {
  const el = document.getElementById("alert-log-list");
  if (!el) return;
  if (!alertLog.length) {
    el.innerHTML = '<span class="mono dim" style="font-size:0.75rem">No alerts recorded yet.</span>';
  } else {
    el.innerHTML = alertLog
      .map(e => `<div class="alert-log-entry">[${e.time}] ${e.msg}</div>`)
      .join("");
  }
  const badge = document.getElementById("alert-badge");
  if (badge) {
    badge.textContent   = alertLog.length;
    badge.style.display = alertLog.length ? "inline" : "none";
  }
}

function clearAlerts() {
  alertLog = []; totalAlerts = 0;
  renderAlertLog();
  const b = document.getElementById("alert-badge");
  if (b) b.style.display = "none";
  setText("total-alerts", "0");
}

// ─── HISTORY ──────────────────────────────────────────────────
function clearHistory() {
  histMax = []; histAvg = []; histMin = [];
  histEWI = []; histExcess = [];
  allTimeMin = Infinity; allTimeMax = -Infinity;
  allTimeSum = 0; allTimeCount = 0;
  drawMainGraph(); drawMiniGraph(); drawEnergyGraph();
  updateHistoryStats();
}

function updateHistoryStats() {
  setText("h-smin",  allTimeMin === Infinity   ? "--" : allTimeMin.toFixed(1));
  setText("h-smax",  allTimeMax === -Infinity  ? "--" : allTimeMax.toFixed(1));
  setText("h-savg",  allTimeCount ? (allTimeSum / allTimeCount).toFixed(1) : "--");
  setText("h-count", allTimeCount);
}

// ─── CRITICAL ALERT POPUP ─────────────────────────────────────
function showCriticalPopup(mx, countdown) {
  if (criticalPopupShown) {
    // Just update countdown
    setText("popup-countdown", countdown);
    return;
  }
  criticalPopupShown = true;
  document.getElementById("popup-max-temp").textContent = mx.toFixed(1);
  setText("popup-countdown", countdown);
  document.getElementById("critical-overlay").classList.add("visible");
}

function hideCriticalPopup() {
  criticalPopupShown = false;
  document.getElementById("critical-overlay").classList.remove("visible");
}

// User pressed OK — acknowledge alert, tell ESP to turn LED off
function acknowledgeCritical() {
  hideCriticalPopup();
  fetch(CONFIG.ESP_IP + "/led?state=ack").catch(() => {});
  addAlertLog("User acknowledged critical alert — LED turned OFF");
  totalAlerts++;
  setText("total-alerts", totalAlerts);
  setText("last-alert-time", new Date().toLocaleTimeString());
  renderAlertLog();
}

// ─── LED CONTROL ─────────────────────────────────────────────
function ledOn() {
  fetch(CONFIG.ESP_IP + "/led?state=on").catch(() => {});
  updateLEDVisual("FULL");
}
function ledOff() {
  fetch(CONFIG.ESP_IP + "/led?state=off").catch(() => {});
  updateLEDVisual("OFF");
}

function updateLEDVisual(state) {
  const vis   = document.getElementById("led-visual");
  const label = document.getElementById("led-state-label");
  if (!vis) return;
  vis.className = "led-visual";
  if      (state === "FULL")  { vis.classList.add("on");    label.textContent = "STATE: FULL BRIGHTNESS"; }
  else if (state === "DIM")   { vis.classList.add("dim");   label.textContent = "STATE: DIMMED (POWER SAVING)"; }
  else if (state === "PULSE") { vis.classList.add("pulse"); label.textContent = "STATE: PULSING — CRITICAL"; }
  else                        { vis.classList.add("off");   label.textContent = "STATE: OFF"; }
}

// ─── HELPER ───────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── SYSTEM STATUS BAR ────────────────────────────────────────
function updateStatusBar(status) {
  const bar = document.getElementById("system-status-bar");
  if (!bar) return;
  bar.className = "system-status-bar";
  if      (status === "NORMAL")   bar.classList.add("normal");
  else if (status === "WARNING")  bar.classList.add("warning");
  else if (status === "CRITICAL") bar.classList.add("critical");
  else if (status === "SHUTDOWN") bar.classList.add("shutdown");
  setText("system-status-text", status);
}

// ─── MAIN UPDATE LOOP ─────────────────────────────────────────
async function updateThermal() {
  try {
    const res  = await fetch(CONFIG.ESP_IP + "/thermal");
    const data = await res.json();
    lastData   = data;

    const temps = data.thermal;
    if (!temps || temps.length !== 64) throw new Error("Bad payload");

    lastTemps = temps;

    // ── ESP-computed values ────────────────────────────────────
    const mn        = data.min;
    const mx        = data.max;
    const avg       = data.avg;
    const frame     = data.frame;
    const radiatedW = data.radiated_w;
    const excessW   = data.excess_w;
    const ewi       = data.ewi;
    const wastedWh  = data.wasted_wh;
    const co2kg     = data.co2_kg;
    const costINR   = data.cost_inr;
    const stdDev    = data.std_dev;
    const anomalyPx = data.anomaly_px;
    const status    = data.status;
    const ledSt     = data.led_state;
    const countdown = data.shutdown_countdown;
    const uptime    = data.uptime_sec;

    // ── Heatmap ────────────────────────────────────────────────
    temps.forEach((t, i) => {
      const color = getColor(t);
      miniCells[i].style.background = color;
      fullCells[i].style.background = color;
    });

    // ── Dashboard ─────────────────────────────────────────────
    const hotPixels = temps.filter(t => t >= threshold).length;
    setText("d-min",        mn.toFixed(1));
    setText("d-avg",        avg.toFixed(1));
    setText("d-max",        mx.toFixed(1));
    setText("d-hotpx",      hotPixels);
    setText("d-ewi",        ewi.toFixed(1));
    setText("d-excess",     excessW.toFixed(3));
    setText("d-status",     status);
    setText("dash-timestamp", new Date().toLocaleTimeString());
    setText("dash-frame",   `FRAME #${frame}`);
    setText("hm-frame",     `FRAME #${frame}`);

    // ── Energy page ────────────────────────────────────────────
    setText("e-radiated",   radiatedW.toFixed(4));
    setText("e-excess",     excessW.toFixed(4));
    setText("e-ewi",        ewi.toFixed(2));
    setText("e-wasted-wh",  wastedWh.toFixed(4));
    setText("e-co2",        (co2kg * 1000).toFixed(4)); // show in grams
    setText("e-cost",       "₹" + costINR.toFixed(4));
    setText("e-stddev",     stdDev.toFixed(3));
    setText("e-anomaly",    anomalyPx);
    setText("e-uptime",     formatUptime(uptime));

    // EWI colour
    const ewiEl = document.getElementById("e-ewi");
    if (ewiEl) {
      ewiEl.style.color = ewi > 60 ? "var(--fire)" : ewi > 30 ? "var(--hot)" : "var(--accent)";
    }

    // ── Controls page ─────────────────────────────────────────
    setText("raw-ts",   new Date().toLocaleTimeString());
    setText("raw-json", JSON.stringify(data, null, 2).slice(0, 1200));
    updateLEDVisual(ledSt);

    // ── History arrays ────────────────────────────────────────
    histMax.push(mx); histAvg.push(avg); histMin.push(mn);
    histEWI.push(ewi); histExcess.push(excessW);
    if (histMax.length > CONFIG.MAX_HISTORY) {
      histMax.shift(); histAvg.shift(); histMin.shift();
      histEWI.shift(); histExcess.shift();
    }

    // ── All-time stats ────────────────────────────────────────
    allTimeMin = Math.min(allTimeMin, mn);
    allTimeMax = Math.max(allTimeMax, mx);
    allTimeSum += avg; allTimeCount++;
    if (mx > peakEver) {
      peakEver = mx;
      setText("peak-temp", mx.toFixed(1) + "°C");
    }

    updateHistoryStats();
    updateRowAvgs(temps);
    drawMiniGraph();
    drawMainGraph();
    drawEnergyGraph();

    // ── System status bar ─────────────────────────────────────
    updateStatusBar(status);

    // ── Threshold alert (webapp side) ─────────────────────────
    const alertBox = document.getElementById("alert-status-box");
    const alertMsg = document.getElementById("alert-status-msg");
    if (alertBox && alertMsg) {
      if (mx >= threshold) {
        alertBox.className = "alert-status-box firing";
        alertMsg.textContent = `⚠ MAX ${mx.toFixed(1)}°C — EWI ${ewi.toFixed(1)} — Excess ${excessW.toFixed(3)}W`;
        if (!alertFiring || Date.now() - lastAlertMs > CONFIG.ALERT_COOLDOWN_MS) {
          alertFiring  = true;
          lastAlertMs  = Date.now();
          totalAlerts++;
          addAlertLog(`MAX ${mx.toFixed(1)}°C | EWI ${ewi.toFixed(1)} | Excess ${excessW.toFixed(3)}W | CO₂ ${(co2kg*1000).toFixed(4)}g`);
          setText("total-alerts",    totalAlerts);
          setText("last-alert-time", new Date().toLocaleTimeString());
        }
      } else {
        alertBox.className   = "alert-status-box";
        alertMsg.textContent = "No active alert. System nominal.";
        alertFiring          = false;
      }
    }

    // ── Critical popup (ESP says CRITICAL or PULSE) ───────────
    if (status === "CRITICAL" && !data.warn_active === false) {
      showCriticalPopup(mx, countdown);
    } else if (ledSt === "PULSE") {
      showCriticalPopup(mx, countdown);
    } else {
      hideCriticalPopup();
    }

    // ── FPS ───────────────────────────────────────────────────
    const now = Date.now();
    setText("sidebar-fps", (1000 / (now - lastFrameMs)).toFixed(1) + " FPS");
    lastFrameMs = now;

    // ── Connection status ─────────────────────────────────────
    document.getElementById("sidebar-status").className = "status-indicator connected";
    setText("sidebar-status-label", "CONNECTED");

  } catch (err) {
    document.getElementById("sidebar-status").className = "status-indicator error";
    setText("sidebar-status-label", "ERROR");
    setText("raw-json", "Connection failed:\n" + err.message);
    updateStatusBar("OFFLINE");
  }
}

// ─── UPTIME FORMATTER ────────────────────────────────────────
function formatUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// ─── START ────────────────────────────────────────────────────
drawMiniGraph();
drawMainGraph();
drawEnergyGraph();
updateThermal();
pollTimer = setInterval(updateThermal, pollInterval);
window.addEventListener("resize", () => {
  drawMiniGraph(); drawMainGraph(); drawEnergyGraph();
});