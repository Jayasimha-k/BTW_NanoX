// ─── APP CONFIGURATION ────────────────────────────────────────
const CONFIG = {
  ESP_IP:             "http://192.168.4.1",
  POLL_INTERVAL_MS:   1000,
  MAX_HISTORY:        60,
  DEFAULT_THRESHOLD:  35,
  ALERT_COOLDOWN_MS:  5000,

  // Physics constants (mirrored from ESP for display purposes)
  BASELINE_TEMP:      25,     // °C ambient
  EMISSIVITY:         0.95,
  PIXEL_AREA_M2:      0.0001, // 1 cm² per pixel
  SIGMA:              5.670374419e-8,

  // Energy cost
  CO2_PER_KWH:        0.82,   // kg CO₂ per kWh — India CEA 2023
  COST_PER_KWH_INR:   7.0,    // ₹ per kWh

  // LED thresholds (must match ESP)
  TEMP_WARN:          35,
  TEMP_CRITICAL:      40,
};