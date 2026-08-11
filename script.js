// =========================================================
// Skyline — Weather Dashboard
// Vanilla JS · OpenWeather API (Geocoding, Current, Forecast, Air Pollution)
//
// Organised top-to-bottom: config → storage → state → DOM refs → icons →
// units/format → sky theme → canvas → API layer → render → events → init
// =========================================================

const CONFIG = {
  base: "https://api.openweathermap.org",
  recentLimit: 6,
  favoriteLimit: 8,
  // Auto-refresh cadence, and the age at which cached data counts as stale.
  refreshMs: 10 * 60 * 1000,
  requestTimeoutMs: 12000,
  suggestDebounceMs: 300,
  // NOTE: a static, backend-less site cannot hide an API key — whatever ships
  // here is readable by anyone. This one is a throwaway demo key; users can
  // point the app at their own with:  Skyline.setApiKey("<key>")
  // For anything beyond a portfolio piece, proxy the calls through a backend.
  demoKey: "c83a00a0e97d817f5c832504db83af6e",
};

const KEYS = {
  unit: "skyline:unit",
  recent: "skyline:recent",
  favorites: "skyline:favorites",
  cache: "skyline:cache",
  apiKey: "skyline:apiKey",
};

// ---------- Storage (never let bad localStorage break the app) ----------
const store = {
  get(key, fallback) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return fallback; // private mode / storage disabled
    }
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return raw; // tolerate values written before they were JSON-encoded
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or disabled storage — persistence is a nicety, not a requirement */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const asArray = (value) => (Array.isArray(value) ? value : []);

// ---------- State ----------
const state = {
  unit: "metric",
  recent: [],
  favorites: [],
  place: null, // { lat, lon, name, country }
  station: null, // nearest reporting station, when it differs from the place name
  data: null, // { current, forecast, air, fetchedAt, stale }
  selectedDay: null, // ISO date string when a forecast day is expanded
  suggestions: [],
  activeSuggestion: -1,
  suggestSeq: 0,
  weatherAbort: null,
  refreshTimer: null,
  tickTimer: null,
};

// Fetch everything in metric and convert at render time, so flipping °C/°F is
// instant and costs no extra API calls.
const FETCH_UNITS = "metric";

// ---------- DOM refs ----------
const el = {
  form: document.getElementById("search-form"),
  input: document.getElementById("search-input"),
  suggestions: document.getElementById("suggestions"),
  locateBtn: document.getElementById("locate-btn"),
  unitToggle: document.getElementById("unit-toggle"),
  placesBar: document.getElementById("places-bar"),

  statusBanner: document.getElementById("status-banner"),
  statusText: document.getElementById("status-text"),
  statusRetry: document.getElementById("status-retry"),
  statusDismiss: document.getElementById("status-dismiss"),

  dashboard: document.getElementById("dashboard"),
  skeleton: document.getElementById("skeleton"),

  cityName: document.getElementById("city-name"),
  cityMeta: document.getElementById("city-meta"),
  favBtn: document.getElementById("fav-btn"),
  shareBtn: document.getElementById("share-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  conditionIcon: document.getElementById("condition-icon"),
  temp: document.getElementById("temp"),
  conditionLabel: document.getElementById("condition-label"),
  feelsLike: document.getElementById("feels-like"),
  hiLo: document.getElementById("hi-lo"),

  sunArcWrap: document.getElementById("sun-arc-wrap"),
  sunDot: document.getElementById("sun-dot"),
  sunPath: document.getElementById("sun-path"),
  sunriseLabel: document.getElementById("sunrise-label"),
  sunsetLabel: document.getElementById("sunset-label"),
  sunCaption: document.getElementById("sun-caption"),

  statHumidity: document.getElementById("stat-humidity"),
  statHumiditySub: document.getElementById("stat-humidity-sub"),
  statWind: document.getElementById("stat-wind"),
  statWindSub: document.getElementById("stat-wind-sub"),
  windArrow: document.getElementById("wind-arrow"),
  statPressure: document.getElementById("stat-pressure"),
  statPressureSub: document.getElementById("stat-pressure-sub"),
  statVisibility: document.getElementById("stat-visibility"),
  statVisibilitySub: document.getElementById("stat-visibility-sub"),
  statAqi: document.getElementById("stat-aqi"),
  statAqiSub: document.getElementById("stat-aqi-sub"),
  statDew: document.getElementById("stat-dew"),
  statDewSub: document.getElementById("stat-dew-sub"),
  statClouds: document.getElementById("stat-clouds"),
  statCloudsSub: document.getElementById("stat-clouds-sub"),
  statPrecip: document.getElementById("stat-precip"),
  statPrecipSub: document.getElementById("stat-precip-sub"),

  forecastStrip: document.getElementById("forecast-strip"),
  forecastNote: document.getElementById("forecast-note"),
  hourlyTitle: document.getElementById("hourly-title"),
  hourlyReset: document.getElementById("hourly-reset"),
  hourlyStrip: document.getElementById("hourly-strip"),
  hourlyScroll: document.getElementById("hourly-scroll"),
  hourlySpark: document.getElementById("hourly-spark"),
};

// ---------- Icon set (inline SVG, currentColor) ----------
const ICONS = {
  sun: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.6"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></g></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  cloud: `<svg viewBox="0 0 24 24" fill="none"><path d="M6.5 18a4 4 0 1 1 .74-7.94 5.5 5.5 0 0 1 10.68 1.6A3.8 3.8 0 0 1 17 18H6.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  cloudSun: `<svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.6"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 2.5v1.6M3.5 8H2M4.6 4.6l1.1 1.1"/></g><path d="M8.2 18h9.3A3.8 3.8 0 0 0 18 10.4a5.5 5.5 0 0 0-8-4.3" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  rain: `<svg viewBox="0 0 24 24" fill="none"><path d="M6.5 14.5a4 4 0 1 1 .74-7.94 5.5 5.5 0 0 1 10.68 1.6A3.8 3.8 0 0 1 17 14.5H6.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 17.5l-1 2.5M12.5 17.5l-1 2.5M17 17.5l-1 2.5"/></g></svg>`,
  thunder: `<svg viewBox="0 0 24 24" fill="none"><path d="M6.5 13.5a4 4 0 1 1 .74-7.94 5.5 5.5 0 0 1 10.68 1.6A3.8 3.8 0 0 1 17 13.5H6.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 14l-3 5h3l-2 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  snow: `<svg viewBox="0 0 24 24" fill="none"><path d="M6.5 13.5a4 4 0 1 1 .74-7.94 5.5 5.5 0 0 1 10.68 1.6A3.8 3.8 0 0 1 17 13.5H6.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 17v4M9 17.8l-1.6 1M9 17.8l1.6 1M15 17v4M15 17.8l-1.6 1M15 17.8l1.6 1"/></g></svg>`,
  mist: `<svg viewBox="0 0 24 24" fill="none"><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 9h13M4 13h16M4 17h11"/></g></svg>`,
};

const isNightIcon = (iconCode) => typeof iconCode === "string" && iconCode.endsWith("n");

function iconFor(main, iconCode) {
  const night = isNightIcon(iconCode);
  switch (main) {
    case "Clear": return night ? ICONS.moon : ICONS.sun;
    case "Clouds": return night ? ICONS.cloud : ICONS.cloudSun;
    case "Rain":
    case "Drizzle": return ICONS.rain;
    case "Thunderstorm": return ICONS.thunder;
    case "Snow": return ICONS.snow;
    default: return ICONS.mist; // Mist, Smoke, Haze, Fog, Dust, Sand, Ash, Squall, Tornado
  }
}

function conditionKey(main, iconCode) {
  switch (main) {
    case "Clear": return isNightIcon(iconCode) ? "clear-night" : "clear-day";
    case "Clouds": return "clouds";
    case "Rain":
    case "Drizzle": return "rain";
    case "Thunderstorm": return "thunderstorm";
    case "Snow": return "snow";
    default: return "mist";
  }
}

// ---------- Units & formatting ----------
// OpenWeather metric gives °C, m/s, metres and hPa. Everything below converts
// from those canonical values so no re-fetch is needed on a unit switch.
const UNITS = {
  metric: {
    temp: (c) => c,
    tempSuffix: "°C",
    speed: (ms) => ms * 3.6,
    speedLabel: "km/h",
    distance: (m) => m / 1000,
    distanceLabel: "km",
    pressure: (hpa) => hpa,
    pressureLabel: "hPa",
    pressureDigits: 0,
    depth: (mm) => mm,
    depthLabel: "mm",
  },
  imperial: {
    temp: (c) => (c * 9) / 5 + 32,
    tempSuffix: "°F",
    speed: (ms) => ms * 2.236936,
    speedLabel: "mph",
    distance: (m) => m / 1609.344,
    distanceLabel: "mi",
    pressure: (hpa) => hpa * 0.02953,
    pressureLabel: "inHg",
    pressureDigits: 2,
    depth: (mm) => mm / 25.4,
    depthLabel: "in",
  },
};

const unitSet = () => UNITS[state.unit] || UNITS.metric;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function temp(celsius, { withUnit = false } = {}) {
  if (!isNum(celsius)) return "--°";
  const u = unitSet();
  return `${Math.round(u.temp(celsius))}°${withUnit ? u.tempSuffix.slice(1) : ""}`;
}

function speed(ms) {
  const u = unitSet();
  return isNum(ms) ? `${Math.round(u.speed(ms))} ${u.speedLabel}` : "--";
}

function distance(metres) {
  const u = unitSet();
  if (!isNum(metres)) return "--";
  const value = u.distance(metres);
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${u.distanceLabel}`;
}

function pressure(hpa) {
  const u = unitSet();
  return isNum(hpa) ? `${u.pressure(hpa).toFixed(u.pressureDigits)} ${u.pressureLabel}` : "--";
}

function depth(mm) {
  const u = unitSet();
  return isNum(mm) ? `${u.depth(mm).toFixed(u.depthLabel === "in" ? 2 : 1)} ${u.depthLabel}` : "--";
}

// A city's local wall clock = its UTC instant shifted by the city's offset,
// then read back with the getUTC* family so the browser's own zone never leaks in.
const shiftToCity = (unixSeconds, tzOffsetSeconds) =>
  new Date((unixSeconds + (tzOffsetSeconds || 0)) * 1000);

function formatCityTime(unixSeconds, tzOffsetSeconds) {
  if (!isNum(unixSeconds)) return "--:--";
  const d = shiftToCity(unixSeconds, tzOffsetSeconds);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// Calendar day in the *city's* zone, as YYYY-MM-DD.
const cityDateKey = (unixSeconds, tzOffsetSeconds) =>
  shiftToCity(unixSeconds, tzOffsetSeconds).toISOString().slice(0, 10);

// Format a YYYY-MM-DD key without letting the browser's timezone shift the day.
function formatDayKey(key, options) {
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { timeZone: "UTC", ...options });
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function relativeTime(timestampMs) {
  const diff = Math.round((Date.now() - timestampMs) / 1000);
  if (diff < 45) return "just now";
  if (diff < 90) return "1 min ago";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 7200) return "1 hour ago";
  return `${Math.round(diff / 3600)} hours ago`;
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compassPoint = (deg) => (isNum(deg) ? COMPASS[Math.round(deg / 22.5) % 16] : "");

const AQI_SCALE = { 1: "Good", 2: "Fair", 3: "Moderate", 4: "Poor", 5: "Very Poor" };
const aqiLabel = (aqi) => AQI_SCALE[aqi] || "--";

// Magnus-Tetens approximation — the current-weather endpoint has no dew point,
// but it is well determined by temperature and relative humidity.
function dewPointC(tempC, humidity) {
  if (!isNum(tempC) || !isNum(humidity) || humidity <= 0) return null;
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(humidity / 100) + (a * tempC) / (b + tempC);
  return (b * gamma) / (a - gamma);
}

function debounce(fn, wait) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

// ---------- Sky theme (time of day + condition tint) ----------
const SKY_PHASES = {
  // Accents double as UI affordances (sparkline, sun dot, focus rings), so each
  // one has to clear ~3:1 against its own phase's backdrop.
  night: { bg: ["#050912", "#131c30"], accent: "#9db4ff" },
  dawn: { bg: ["#2b2a55", "#f7a072"], accent: "#ffd27a" },
  morning: { bg: ["#2f8fe0", "#bfe3ff"], accent: "#ffe29a" },
  midday: { bg: ["#1f7bd6", "#57c2ff"], accent: "#ffe29a" },
  afternoon: { bg: ["#1f6fc4", "#f6b352"], accent: "#ffcf7d" },
  dusk: { bg: ["#33235c", "#ff8a5c"], accent: "#ffb37b" },
};

const CONDITION_TINTS = {
  clouds: { toward: "#8a97a8", amount: 0.35 },
  rain: { toward: "#3b4a5a", amount: 0.5 },
  thunderstorm: { toward: "#241c38", amount: 0.6 },
  snow: { toward: "#e4ecf5", amount: 0.5 },
  mist: { toward: "#9aa3ac", amount: 0.45 },
};

function getSkyPhase(now, sunrise, sunset) {
  const twilight = 45 * 60;
  const dayLength = sunset - sunrise;
  // Polar day/night: the API can report sunrise === sunset, which would make
  // the progress fraction NaN.
  if (!isNum(dayLength) || dayLength <= 0) return "night";
  if (now < sunrise - twilight || now > sunset + twilight) return "night";
  if (now < sunrise + twilight) return "dawn";
  if (now > sunset - twilight) return "dusk";
  const progress = (now - sunrise) / dayLength;
  if (progress < 0.35) return "morning";
  if (progress < 0.65) return "midday";
  return "afternoon";
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return a.map((c, i) => Math.round(c + (b[i] - c) * t));
}

const rgbCss = (rgb) => `rgb(${rgb.join(",")})`;

// WCAG relative luminance — used to decide whether the page needs dark or
// light text, instead of hardcoding it per weather condition.
function luminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function applySkyTheme(main, iconCode, sunrise, sunset, now) {
  const phase = getSkyPhase(now, sunrise, sunset);
  const { bg: [bg1Base, bg2Base], accent } = SKY_PHASES[phase];
  const tint = CONDITION_TINTS[conditionKey(main, iconCode)];
  const bg1 = tint ? mixRgb(bg1Base, tint.toward, tint.amount) : hexToRgb(bg1Base);
  const bg2 = tint ? mixRgb(bg2Base, tint.toward, tint.amount) : hexToRgb(bg2Base);

  const body = document.body;
  body.style.setProperty("--bg-1", rgbCss(bg1));
  body.style.setProperty("--bg-2", rgbCss(bg2));
  body.style.setProperty("--accent", accent);

  // Light backdrops (snow, bright midday) need dark ink to stay readable.
  // 0.197 is where white and dark ink give equal contrast against a backdrop —
  // above it, dark ink wins. Guessing higher leaves white text on bright skies.
  const light = (luminance(bg1) + luminance(bg2)) / 2 > 0.197;
  body.setAttribute("data-surface", light ? "light" : "dark");
  body.dataset.phase = phase;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", rgbCss(bg1));
}

// ---------- Sky canvas (ambient particles) ----------
const canvas = document.getElementById("sky-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const sky = {
  mode: "clear-day",
  particles: [],
  width: 0,
  height: 0,
  frame: null,
  flash: 0,
  nextFlashAt: 0,
  elapsed: 0,
};

function resizeCanvas() {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  sky.width = window.innerWidth;
  sky.height = window.innerHeight;
  // Back the canvas with device pixels so particles aren't blurry on retina.
  canvas.width = Math.round(sky.width * dpr);
  canvas.height = Math.round(sky.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedParticles(sky.mode); // re-seed so nothing is stranded off-screen
}

function seedParticles(mode) {
  sky.mode = mode;
  sky.particles = [];
  if (!canvas) return;
  const { width: w, height: h } = sky;
  if (!w || !h) return;

  // Scale the particle count to the viewport so phones don't do desktop work.
  const density = Math.min(1.6, Math.max(0.45, (w * h) / (1440 * 900)));

  if (mode === "rain" || mode === "thunderstorm") {
    const n = Math.round(110 * density);
    for (let i = 0; i < n; i++) {
      sky.particles.push({ x: Math.random() * w, y: Math.random() * h, len: 10 + Math.random() * 14, speed: 6 + Math.random() * 6 });
    }
  } else if (mode === "snow") {
    const n = Math.round(90 * density);
    for (let i = 0; i < n; i++) {
      sky.particles.push({ x: Math.random() * w, y: Math.random() * h, r: 1.5 + Math.random() * 2.5, speed: 0.6 + Math.random() * 1.2, drift: Math.random() - 0.5 });
    }
  } else if (mode === "clear-night") {
    const n = Math.round(70 * density);
    for (let i = 0; i < n; i++) {
      sky.particles.push({ x: Math.random() * w, y: Math.random() * h * 0.7, r: Math.random() * 1.4, tw: Math.random() * Math.PI * 2 });
    }
  }

  startSky();
}

function drawSky(animate) {
  const { width: w, height: h } = sky;
  ctx.clearRect(0, 0, w, h);

  if (sky.mode === "rain" || sky.mode === "thunderstorm") {
    ctx.strokeStyle = "rgba(180, 220, 255, 0.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    sky.particles.forEach((p) => {
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 2, p.y + p.len);
      if (!animate) return;
      p.y += p.speed;
      if (p.y > h) {
        p.y = -p.len;
        p.x = Math.random() * w;
      }
    });
    ctx.stroke();

    // Occasional lightning wash, so thunderstorms read differently from rain.
    if (sky.mode === "thunderstorm" && animate) {
      sky.elapsed += 1;
      if (sky.elapsed > sky.nextFlashAt) {
        sky.flash = 1;
        sky.elapsed = 0;
        sky.nextFlashAt = 180 + Math.floor(Math.random() * 420);
      }
      if (sky.flash > 0) {
        ctx.fillStyle = `rgba(214, 226, 255, ${sky.flash * 0.16})`;
        ctx.fillRect(0, 0, w, h);
        sky.flash = Math.max(0, sky.flash - 0.08);
      }
    }
  } else if (sky.mode === "snow") {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    sky.particles.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (!animate) return;
      p.y += p.speed;
      p.x += p.drift;
      if (p.y > h) {
        p.y = -4;
        p.x = Math.random() * w;
      }
      if (p.x < -4) p.x = w + 4;
      if (p.x > w + 4) p.x = -4;
    });
  } else if (sky.mode === "clear-night") {
    sky.particles.forEach((p) => {
      if (animate) p.tw += 0.02;
      const alpha = 0.4 + Math.sin(p.tw) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, alpha)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function skyLoop() {
  drawSky(true);
  sky.frame = requestAnimationFrame(skyLoop);
}

function stopSky() {
  if (sky.frame !== null) {
    cancelAnimationFrame(sky.frame);
    sky.frame = null;
  }
}

// The original looped requestAnimationFrame forever, even with zero particles
// and even when the user asked for reduced motion. Now the loop only runs when
// there is something to animate and the tab is visible.
function startSky() {
  stopSky();
  if (!ctx) return;
  if (!sky.particles.length) {
    ctx.clearRect(0, 0, sky.width, sky.height);
    return;
  }
  if (reduceMotion.matches) {
    drawSky(false); // one static frame
    return;
  }
  if (document.hidden) return;
  sky.frame = requestAnimationFrame(skyLoop);
}

// ---------- Status banner ----------
let retryAction = null;

function showBanner(message, { tone = "error", retry = null } = {}) {
  el.statusText.textContent = message;
  el.statusBanner.dataset.tone = tone;
  el.statusBanner.hidden = false;
  retryAction = retry;
  el.statusRetry.hidden = !retry;
}

function hideBanner() {
  el.statusBanner.hidden = true;
  el.statusRetry.hidden = true;
  retryAction = null;
}

function setLoading(isLoading) {
  el.skeleton.classList.toggle("active", isLoading);
  el.dashboard.classList.toggle("hidden", isLoading);
}

// ---------- API layer ----------
const apiKey = () => store.get(KEYS.apiKey, null) || CONFIG.demoKey;

class ApiError extends Error {}

async function apiGet(path, params, parentSignal) {
  const url = new URL(path, CONFIG.base);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("appid", apiKey());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), CONFIG.requestTimeoutMs);
  const relay = () => controller.abort(parentSignal.reason);
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener("abort", relay, { once: true });
  }

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 401) throw new ApiError("OpenWeather rejected the API key. Set your own with Skyline.setApiKey(\"…\").");
    if (res.status === 404) throw new ApiError("No weather data for that location.");
    if (res.status === 429) throw new ApiError("Too many requests — the free API tier is rate-limited. Try again in a minute.");
    if (!res.ok) throw new ApiError(`The weather service returned an error (${res.status}).`);
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === "AbortError") throw err; // superseded by a newer request
    if (err.name === "TimeoutError") throw new ApiError("The weather service took too long to respond.");
    // fetch() rejects with a TypeError for DNS/offline/CORS failures.
    throw new ApiError(navigator.onLine ? "Couldn't reach the weather service." : "You appear to be offline.");
  } finally {
    clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener("abort", relay);
  }
}

const geocode = (query, signal) =>
  apiGet("/geo/1.0/direct", { q: query, limit: 5 }, signal);

const reverseGeocode = (lat, lon, signal) =>
  apiGet("/geo/1.0/reverse", { lat, lon, limit: 1 }, signal);

// ---------- Places (favorites + recents) ----------
// Two cities can share a name inside one country, so identity is the rounded
// coordinate pair rather than the label.
// Labels we assign ourselves when no real place name is known — these should be
// replaced by whatever the API reports, unlike a name the user chose.
const GENERIC_NAMES = new Set(["Your location", "Selected location", ""]);

const placeId = (p) => `${Number(p.lat).toFixed(2)},${Number(p.lon).toFixed(2)}`;
const samePlace = (a, b) => a && b && placeId(a) === placeId(b);
const placeLabel = (p) => `${p.name}${p.country ? ", " + p.country : ""}`;

function normalisePlace(p) {
  return {
    name: p.name,
    country: p.country || "",
    lat: Number(Number(p.lat).toFixed(4)),
    lon: Number(Number(p.lon).toFixed(4)),
  };
}

function saveRecent(place) {
  const entry = normalisePlace(place);
  state.recent = [entry, ...state.recent.filter((r) => !samePlace(r, entry))].slice(0, CONFIG.recentLimit);
  store.set(KEYS.recent, state.recent);
  renderPlaces();
}

function isFavorite(place) {
  return place ? state.favorites.some((f) => samePlace(f, place)) : false;
}

function toggleFavorite(place) {
  if (!place) return;
  const entry = normalisePlace(place);
  if (isFavorite(entry)) {
    state.favorites = state.favorites.filter((f) => !samePlace(f, entry));
  } else {
    if (state.favorites.length >= CONFIG.favoriteLimit) {
      showBanner(`You can save up to ${CONFIG.favoriteLimit} places. Remove one first.`, { tone: "info" });
      return;
    }
    state.favorites = [...state.favorites, entry];
  }
  store.set(KEYS.favorites, state.favorites);
  renderPlaces();
  renderFavButton();
}

function removePlace(place, list) {
  if (list === "favorites") {
    state.favorites = state.favorites.filter((f) => !samePlace(f, place));
    store.set(KEYS.favorites, state.favorites);
    renderFavButton();
  } else {
    state.recent = state.recent.filter((r) => !samePlace(r, place));
    store.set(KEYS.recent, state.recent);
  }
  renderPlaces();
}

function renderPlaces() {
  el.placesBar.textContent = "";

  const rows = [
    ...state.favorites.map((p) => ({ place: p, list: "favorites" })),
    ...state.recent.filter((p) => !isFavorite(p)).map((p) => ({ place: p, list: "recent" })),
  ];

  rows.forEach(({ place, list }) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    if (list === "favorites") chip.classList.add("chip-fav");
    if (samePlace(place, state.place)) chip.classList.add("chip-active");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "chip-open";
    open.textContent = `${list === "favorites" ? "★ " : ""}${placeLabel(place)}`;
    open.addEventListener("click", () => loadWeather(place));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-remove";
    remove.innerHTML = "&times;";
    remove.title = `Remove ${placeLabel(place)}`;
    remove.setAttribute("aria-label", `Remove ${placeLabel(place)}`);
    remove.addEventListener("click", () => removePlace(place, list));

    chip.append(open, remove);
    el.placesBar.appendChild(chip);
  });
}

// ---------- Geocoding autocomplete ----------
async function fetchSuggestions(query) {
  if (!query || query.length < 2) {
    hideSuggestions();
    return [];
  }
  const seq = ++state.suggestSeq;
  try {
    const data = await geocode(query);
    // Ignore a slow response that a newer keystroke has already superseded.
    if (seq !== state.suggestSeq) return state.suggestions;
    state.suggestions = asArray(data);
    if (state.suggestions.length) renderSuggestions();
    // OpenWeather's geocoder matches whole names, not prefixes — "new yor"
    // returns nothing. Say so, rather than showing an empty dropdown.
    else showSuggestionNote(`No match for “${query}” yet — try the full city name.`);
    return state.suggestions;
  } catch (err) {
    if (seq !== state.suggestSeq) return state.suggestions;
    state.suggestions = [];
    hideSuggestions();
    if (err instanceof ApiError) showBanner(err.message);
    return [];
  }
}

function showSuggestionNote(text) {
  state.suggestions = [];
  state.activeSuggestion = -1;
  el.suggestions.textContent = "";
  const li = document.createElement("li");
  li.className = "suggest-note";
  li.textContent = text;
  el.suggestions.appendChild(li);
  el.suggestions.hidden = false;
  el.input.setAttribute("aria-expanded", "true");
  el.input.removeAttribute("aria-activedescendant");
}

function renderSuggestions() {
  state.activeSuggestion = -1;
  el.suggestions.textContent = "";

  if (state.suggestions.length === 0) {
    hideSuggestions();
    return;
  }

  state.suggestions.forEach((s, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.id = `suggestion-${i}`;

    // textContent, not innerHTML — place names come from the network and are
    // not ours to trust as markup.
    const primary = document.createElement("span");
    primary.textContent = s.name;
    const secondary = document.createElement("span");
    secondary.className = "sub";
    secondary.textContent = [s.state, s.country].filter(Boolean).join(", ");

    li.append(primary, secondary);
    li.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the input
    li.addEventListener("click", () => selectSuggestion(s));
    el.suggestions.appendChild(li);
  });

  el.suggestions.hidden = false;
  el.input.setAttribute("aria-expanded", "true");
}

function hideSuggestions() {
  el.suggestions.hidden = true;
  el.suggestions.textContent = "";
  el.input.setAttribute("aria-expanded", "false");
  el.input.removeAttribute("aria-activedescendant");
  state.suggestions = [];
  state.activeSuggestion = -1;
}

function highlightSuggestion() {
  const items = [...el.suggestions.children];
  items.forEach((li, i) => li.setAttribute("aria-selected", i === state.activeSuggestion ? "true" : "false"));
  const active = items[state.activeSuggestion];
  if (active) {
    // Screen readers follow aria-activedescendant; sighted users need the row scrolled in.
    el.input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  } else {
    el.input.removeAttribute("aria-activedescendant");
  }
}

function selectSuggestion(s) {
  // Cancel the pending debounce, otherwise the last keystroke re-opens the
  // dropdown ~300ms after the user has already picked something.
  debouncedSuggest.cancel();
  state.suggestSeq++;
  el.input.value = placeLabel(s);
  hideSuggestions();
  loadWeather({ lat: s.lat, lon: s.lon, name: s.name, country: s.country });
}

const debouncedSuggest = debounce((value) => fetchSuggestions(value), CONFIG.suggestDebounceMs);

// ---------- Core data fetch ----------
function cacheData(place, payload) {
  store.set(KEYS.cache, { place, payload, fetchedAt: Date.now() });
}

function readCache(place) {
  const cached = store.get(KEYS.cache, null);
  if (!cached || !cached.payload || !cached.place) return null;
  if (place && !samePlace(cached.place, place)) return null;
  return cached;
}

async function loadWeather(rawPlace, { silent = false, pushUrl = true } = {}) {
  const place = normalisePlace(rawPlace);
  if (!isNum(place.lat) || !isNum(place.lon)) {
    showBanner("That place has no usable coordinates.");
    return;
  }

  // A newer request always wins — the old one is cancelled rather than left to
  // land late and overwrite fresher data.
  if (state.weatherAbort) state.weatherAbort.abort(new DOMException("Superseded", "AbortError"));
  const controller = new AbortController();
  state.weatherAbort = controller;

  hideBanner();
  state.place = place;
  state.station = null;
  state.selectedDay = null;
  renderPlaces();
  if (!silent) setLoading(true);
  el.refreshBtn.classList.add("loading");

  const coords = { lat: place.lat, lon: place.lon };

  try {
    // One failure shouldn't sink the others: current conditions are required,
    // forecast and air quality are enhancements.
    const [currentResult, forecastResult, airResult] = await Promise.allSettled([
      apiGet("/data/2.5/weather", { ...coords, units: FETCH_UNITS }, controller.signal),
      apiGet("/data/2.5/forecast", { ...coords, units: FETCH_UNITS }, controller.signal),
      apiGet("/data/2.5/air_pollution", coords, controller.signal),
    ]);

    if (controller.signal.aborted) return;
    if (currentResult.status === "rejected") throw currentResult.reason;

    const current = currentResult.value;
    if (!current || !asArray(current.weather).length) throw new ApiError("The weather service returned an unexpected response.");

    const payload = {
      current,
      forecast: forecastResult.status === "fulfilled" ? forecastResult.value : null,
      air: airResult.status === "fulfilled" ? airResult.value : null,
    };

    state.data = { ...payload, fetchedAt: Date.now(), stale: false };
    // Keep the name the user actually picked. The current-weather endpoint
    // names the nearest reporting station, so searching "Reykjavik" comes back
    // as "Grímsstaðaholt" — accurate, but not what anyone searched for. Only
    // fall back to it when we have no real name of our own.
    state.place = normalisePlace({
      ...place,
      name: GENERIC_NAMES.has(place.name) || !place.name ? current.name || place.name : place.name,
      country: place.country || current.sys?.country || "",
    });
    state.station = current.name && current.name !== state.place.name ? current.name : null;

    render();
    saveRecent(state.place);
    cacheData(state.place, payload);
    if (pushUrl) syncUrl(state.place);
    scheduleRefresh();

    if (!payload.forecast) {
      showBanner("Forecast data is unavailable right now — current conditions are still live.", { tone: "info" });
    }
  } catch (err) {
    if (err?.name === "AbortError") return; // superseded, not a failure
    const message = err instanceof ApiError ? err.message : "Something went wrong fetching the weather.";

    // Falling back to the last good payload beats showing an empty dashboard.
    const cached = readCache(place);
    if (cached) {
      state.data = { ...cached.payload, fetchedAt: cached.fetchedAt, stale: true };
      state.place = normalisePlace(cached.place);
      render();
      showBanner(`${message} Showing the last data from ${relativeTime(cached.fetchedAt)}.`, {
        tone: "info",
        retry: () => loadWeather(place),
      });
    } else {
      showBanner(message, { retry: () => loadWeather(place) });
    }
  } finally {
    // If a newer request has taken over, it owns the loading state now —
    // clearing it here would hide its skeleton while it is still in flight.
    if (state.weatherAbort === controller) {
      state.weatherAbort = null;
      el.refreshBtn.classList.remove("loading");
      if (!silent) setLoading(false);
    }
  }
}

function scheduleRefresh() {
  clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => {
    if (document.hidden || !state.place) return;
    loadWeather(state.place, { silent: true, pushUrl: false });
  }, CONFIG.refreshMs);
}

// ---------- URL sync (shareable / bookmarkable places) ----------
function syncUrl(place) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("lat", place.lat);
    url.searchParams.set("lon", place.lon);
    url.searchParams.set("name", place.name);
    if (place.country) url.searchParams.set("country", place.country);
    else url.searchParams.delete("country");
    history.replaceState(null, "", url);
  } catch {
    /* file:// URLs can't take search params — harmless */
  }
}

function placeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const rawLat = params.get("lat");
  const rawLon = params.get("lon");
  // Guard the empty case explicitly: Number(null) and Number("") are both 0,
  // which would silently resolve to the Atlantic at 0°N 0°E.
  if (!rawLat || !rawLon) return null;
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!isNum(lat) || !isNum(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, name: params.get("name") || "Selected location", country: params.get("country") || "" };
}

// ---------- Derivations ----------
// Group the 3-hour forecast slots into calendar days in the city's own zone.
function groupByDay(forecast, tzOffset) {
  const days = new Map();
  asArray(forecast?.list).forEach((item) => {
    const key = cityDateKey(item.dt, tzOffset);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(item);
  });
  return days;
}

const rangeOf = (items, extra = []) => {
  const temps = [...items.map((s) => s.main?.temp), ...extra].filter(isNum);
  return temps.length ? { min: Math.min(...temps), max: Math.max(...temps) } : null;
};

// The forecast endpoint only looks forward, so late in the evening "today's
// high/low" would be computed from one or two remaining slots — technically
// true, useless in practice. Fall back to a rolling 24-hour window and say so.
function heroRange(current, forecast, days, tzOffset) {
  const slots = days.get(cityDateKey(current.dt, tzOffset)) || [];
  if (slots.length >= 4) {
    const r = rangeOf(slots, [current.main?.temp]);
    if (r) return { ...r, scope: "today" };
  }
  const next24 = asArray(forecast?.list).slice(0, 8);
  const r = rangeOf(next24, [current.main?.temp]);
  if (r) return { ...r, scope: "next 24h" };
  return rangeOf([], [current.main?.temp_min, current.main?.temp_max]);
}

// ---------- Render ----------
function render() {
  if (!state.data?.current) return;
  const { current, forecast, air } = state.data;
  const tz = current.timezone || 0;
  const w = current.weather[0] || {};
  const days = groupByDay(forecast, tz);

  const key = conditionKey(w.main, w.icon);
  document.body.setAttribute("data-condition", key);
  if (sky.mode !== key) seedParticles(key);
  applySkyTheme(w.main, w.icon, current.sys?.sunrise, current.sys?.sunset, current.dt);

  renderHero(current, forecast, tz, w, days);
  renderStats(current, forecast, air);
  renderDailyForecast(days, current, tz);
  renderHourly(forecast, tz, days);
  renderFavButton();

  el.shareBtn.disabled = false;
  el.refreshBtn.disabled = false;
}

function renderHero(current, forecast, tz, w, days) {
  el.cityName.textContent = state.place?.name || current.name || "—";
  updateMeta();

  el.conditionIcon.innerHTML = iconFor(w.main, w.icon);
  el.temp.textContent = temp(current.main?.temp);
  el.conditionLabel.textContent = w.description || "—";
  el.feelsLike.textContent = `Feels like ${temp(current.main?.feels_like)}`;

  const range = heroRange(current, forecast, days, tz);
  el.hiLo.textContent = range
    ? `H ${temp(range.max)} · L ${temp(range.min)}${range.scope ? ` · ${range.scope}` : ""}`
    : "";

  renderSunArc(current, tz);
}

// Local wall clock + data age, refreshed on a ticker so "5 min ago" stays true.
function updateMeta() {
  const current = state.data?.current;
  if (!current) return;
  const tz = current.timezone || 0;
  const local = shiftToCity(Date.now() / 1000, tz);
  const clock = local.toLocaleTimeString(undefined, { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
  const parts = [`${clock} local`];
  if (state.place?.country) parts.push(state.place.country);
  // Which station the reading came from, when it isn't the city itself.
  if (state.station) parts.push(`via ${state.station}`);
  if (state.data.fetchedAt) parts.push(`updated ${relativeTime(state.data.fetchedAt)}`);
  if (state.data.stale) parts.push("cached");
  el.cityMeta.textContent = parts.join(" · ");
}

function renderSunArc(current, tz) {
  const sunrise = current.sys?.sunrise;
  const sunset = current.sys?.sunset;
  const now = Math.floor(Date.now() / 1000);

  el.sunriseLabel.textContent = formatCityTime(sunrise, tz);
  el.sunsetLabel.textContent = formatCityTime(sunset, tz);

  if (!isNum(sunrise) || !isNum(sunset) || sunset <= sunrise) {
    el.sunCaption.textContent = "Polar day/night";
    el.sunArcWrap.dataset.state = "night";
    return;
  }

  const dayLength = sunset - sunrise;
  const pct = Math.min(1, Math.max(0, (now - sunrise) / dayLength));
  const isDaytime = now >= sunrise && now <= sunset;

  el.sunArcWrap.dataset.state = isDaytime ? "day" : "night";
  if (isDaytime) {
    el.sunCaption.textContent = `${formatDuration(sunset - now)} of daylight left`;
  } else if (now < sunrise) {
    el.sunCaption.textContent = `Sunrise in ${formatDuration(sunrise - now)}`;
  } else {
    // Next sunrise is roughly one day after today's.
    el.sunCaption.textContent = `Sunrise in ${formatDuration(sunrise + 86400 - now)}`;
  }

  const path = el.sunPath;
  if (!path || typeof path.getTotalLength !== "function") return;
  const point = path.getPointAtLength(path.getTotalLength() * pct);
  el.sunDot.setAttribute("cx", point.x);
  el.sunDot.setAttribute("cy", point.y);
}

function renderStats(current, forecast, air) {
  const u = unitSet();
  const main = current.main || {};
  const wind = current.wind || {};

  el.statHumidity.textContent = isNum(main.humidity) ? `${main.humidity}%` : "--";
  el.statHumiditySub.textContent = isNum(main.humidity)
    ? main.humidity >= 70 ? "Humid" : main.humidity <= 30 ? "Dry" : "Comfortable"
    : "";

  el.statWind.textContent = speed(wind.speed);
  if (isNum(wind.deg)) {
    el.windArrow.hidden = false;
    // The API reports the direction wind comes *from*; the arrow shows where it goes.
    el.windArrow.style.transform = `rotate(${(wind.deg + 180) % 360}deg)`;
    el.statWindSub.textContent = `from ${compassPoint(wind.deg)}${isNum(wind.gust) ? ` · gusts ${speed(wind.gust)}` : ""}`;
  } else {
    el.windArrow.hidden = true;
    el.statWindSub.textContent = isNum(wind.gust) ? `gusts ${speed(wind.gust)}` : "";
  }

  el.statPressure.textContent = pressure(main.pressure);
  el.statPressureSub.textContent = isNum(main.pressure)
    ? main.pressure >= 1013 ? "Above average" : "Below average"
    : "";

  // The current-weather payload omits `visibility` in some regions — the old
  // code divided undefined by 1000 and printed "NaN km".
  el.statVisibility.textContent = distance(current.visibility);
  el.statVisibilitySub.textContent = isNum(current.visibility)
    ? current.visibility >= 10000 ? "Clear" : current.visibility >= 4000 ? "Moderate" : "Poor"
    : "Not reported";

  const aqiEntry = air?.list?.[0];
  const aqi = aqiEntry?.main?.aqi;
  el.statAqi.textContent = aqiLabel(aqi);
  const pm25 = aqiEntry?.components?.pm2_5;
  el.statAqiSub.textContent = isNum(pm25) ? `PM2.5 ${pm25.toFixed(1)} µg/m³` : air ? "" : "Unavailable";

  const dew = dewPointC(main.temp, main.humidity);
  el.statDew.textContent = temp(dew);
  el.statDewSub.textContent = isNum(dew)
    ? dew >= 20 ? "Muggy" : dew >= 13 ? "Sticky" : "Dry air"
    : "";

  const clouds = current.clouds?.all;
  el.statClouds.textContent = isNum(clouds) ? `${clouds}%` : "--";
  el.statCloudsSub.textContent = isNum(clouds)
    ? clouds <= 10 ? "Clear sky" : clouds <= 50 ? "Partly cloudy" : clouds <= 85 ? "Mostly cloudy" : "Overcast"
    : "";

  // Rain/snow volume is only present when it is actually falling.
  const fallen = (current.rain?.["1h"] ?? current.snow?.["1h"]);
  const nextSlot = asArray(forecast?.list)[0];
  const pop = isNum(nextSlot?.pop) ? Math.round(nextSlot.pop * 100) : null;
  el.statPrecip.textContent = isNum(fallen) ? depth(fallen) : pop !== null ? `${pop}%` : "None";
  el.statPrecipSub.textContent = isNum(fallen)
    ? "last hour"
    : pop !== null ? `chance in the next 3h` : `no ${u.depthLabel} reported`;
}

function renderDailyForecast(days, current, tz) {
  el.forecastStrip.textContent = "";
  el.forecastNote.hidden = true;
  if (!days.size) return;

  const todayKey = cityDateKey(current.dt, tz);
  const keys = [...days.keys()].sort().slice(0, 6);

  keys.forEach((key) => {
    const items = days.get(key);
    const temps = items.map((i) => i.main?.temp).filter(isNum);
    if (!temps.length) return;

    // The slot nearest 13:00 local is the most representative for the day.
    const representative = items.reduce((best, i) => {
      const hour = shiftToCity(i.dt, tz).getUTCHours();
      const bestHour = shiftToCity(best.dt, tz).getUTCHours();
      return Math.abs(hour - 13) < Math.abs(bestHour - 13) ? i : best;
    }, items[0]);
    const rw = asArray(representative.weather)[0] || {};
    const pop = Math.max(...items.map((i) => (isNum(i.pop) ? i.pop : 0)));

    const card = document.createElement("button");
    card.type = "button";
    card.className = "forecast-day";
    card.setAttribute("role", "listitem");
    card.dataset.day = key;
    if (key === state.selectedDay) card.classList.add("selected");

    const dayName = document.createElement("span");
    dayName.className = "day-name";
    dayName.textContent = key === todayKey ? "Today" : formatDayKey(key, { weekday: "short" });

    const icon = document.createElement("span");
    icon.className = "day-icon";
    icon.innerHTML = iconFor(rw.main, rw.icon);

    const dayTemp = document.createElement("span");
    dayTemp.className = "day-temp";
    const hi = document.createElement("span");
    hi.textContent = temp(Math.max(...temps));
    const lo = document.createElement("span");
    lo.className = "lo";
    lo.textContent = temp(Math.min(...temps));
    dayTemp.append(hi, document.createTextNode(" "), lo);

    const popEl = document.createElement("span");
    popEl.className = "day-pop";
    popEl.textContent = pop >= 0.1 ? `${Math.round(pop * 100)}%` : "";

    // Partial days at either end of the window have fewer than 8 slots.
    if (items.length < 8) {
      card.title = `${formatDayKey(key, { weekday: "long", month: "short", day: "numeric" })} — partial day (${items.length} of 8 readings)`;
      card.classList.add("partial");
    } else {
      card.title = formatDayKey(key, { weekday: "long", month: "short", day: "numeric" });
    }

    card.append(dayName, icon, dayTemp, popEl);
    card.addEventListener("click", () => selectDay(key));
    el.forecastStrip.appendChild(card);
  });

  el.forecastNote.hidden = !el.forecastStrip.children.length;
}

function selectDay(key) {
  state.selectedDay = state.selectedDay === key ? null : key;
  const { current, forecast } = state.data;
  const tz = current.timezone || 0;
  const days = groupByDay(forecast, tz);
  renderDailyForecast(days, current, tz);
  renderHourly(forecast, tz, days);
  el.hourlyScroll.scrollLeft = 0;
}

function renderHourly(forecast, tz, days) {
  el.hourlyStrip.textContent = "";
  el.hourlySpark.textContent = "";

  const selected = state.selectedDay;
  const items = selected
    ? (days.get(selected) || [])
    : asArray(forecast?.list).slice(0, 12);

  el.hourlyTitle.textContent = selected
    ? `${formatDayKey(selected, { weekday: "long", month: "short", day: "numeric" })} · 3-hourly`
    : "Next hours";
  el.hourlyReset.hidden = !selected;

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "No forecast slots available.";
    el.hourlyStrip.appendChild(empty);
    return;
  }

  let previousDay = null;
  items.forEach((item) => {
    const local = shiftToCity(item.dt, tz);
    const dayKey = cityDateKey(item.dt, tz);
    const iw = asArray(item.weather)[0] || {};

    const cell = document.createElement("div");
    cell.className = "hourly-item";
    cell.setAttribute("role", "listitem");

    const label = document.createElement("span");
    label.className = "hour-label";
    const clock = `${String(local.getUTCHours()).padStart(2, "0")}:00`;
    // Mark where the strip rolls over into the next day.
    label.textContent = previousDay && previousDay !== dayKey
      ? `${formatDayKey(dayKey, { weekday: "short" })} ${clock}`
      : clock;
    previousDay = dayKey;

    const icon = document.createElement("span");
    icon.className = "hour-icon";
    icon.innerHTML = iconFor(iw.main, iw.icon);

    const t = document.createElement("span");
    t.className = "hour-temp";
    t.textContent = temp(item.main?.temp);

    const pop = document.createElement("span");
    pop.className = "hour-pop";
    const popValue = isNum(item.pop) ? Math.round(item.pop * 100) : 0;
    if (popValue >= 10) {
      pop.textContent = `${popValue}%`;
      pop.dataset.level = popValue >= 70 ? "high" : popValue >= 40 ? "mid" : "low";
    } else {
      pop.innerHTML = "&nbsp;";
    }

    cell.title = `${clock} · ${iw.description || ""} · ${temp(item.main?.temp, { withUnit: true })}${popValue ? ` · ${popValue}% chance of precipitation` : ""}`;
    cell.append(label, icon, t, pop);
    el.hourlyStrip.appendChild(cell);
  });

  drawSparkline(items);
}

// Measure the rendered cells rather than assuming a fixed width, so the
// sparkline stays aligned at any font size or zoom level.
function drawSparkline(items) {
  const temps = items.map((i) => i.main?.temp).filter(isNum);
  if (temps.length < 2) return;

  requestAnimationFrame(() => {
    const cells = [...el.hourlyStrip.children];
    if (cells.length !== items.length) return;

    const width = el.hourlyStrip.scrollWidth;
    const height = 30; // must match .hourly-spark in style.css
    if (!width) return;

    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const span = max - min || 1;
    const pad = 5;

    const points = cells.map((cell, i) => {
      const x = cell.offsetLeft + cell.offsetWidth / 2;
      const value = items[i].main?.temp;
      const y = isNum(value) ? height - pad - ((value - min) / span) * (height - pad * 2) : height / 2;
      return [x, y];
    });

    el.hourlySpark.setAttribute("viewBox", `0 0 ${width} ${height}`);
    el.hourlySpark.style.width = `${width}px`;

    const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${points[0][0].toFixed(1)},${height} ${line} ${points[points.length - 1][0].toFixed(1)},${height}`;

    const fill = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    fill.setAttribute("points", area);
    fill.setAttribute("class", "spark-area");

    const stroke = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    stroke.setAttribute("points", line);
    stroke.setAttribute("class", "spark-line");

    el.hourlySpark.append(fill, stroke);
  });
}

function renderFavButton() {
  const saved = isFavorite(state.place);
  el.favBtn.disabled = !state.place;
  el.favBtn.setAttribute("aria-pressed", String(saved));
  el.favBtn.classList.toggle("active", saved);
  el.favBtn.title = saved ? "Remove from saved places" : "Save this place";
  el.favBtn.setAttribute("aria-label", el.favBtn.title);
}

function renderUnitToggle() {
  [...el.unitToggle.querySelectorAll(".unit-option")].forEach((btn) => {
    const on = btn.dataset.unit === state.unit;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

// ---------- Events ----------
el.input.addEventListener("input", (e) => debouncedSuggest(e.target.value.trim()));

el.input.addEventListener("keydown", (e) => {
  if (el.suggestions.hidden) return;
  // The dropdown may be showing a "no match" note with nothing selectable.
  if (!state.suggestions.length) {
    if (e.key === "Escape") hideSuggestions();
    return;
  }
  const max = state.suggestions.length - 1;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    state.activeSuggestion = state.activeSuggestion >= max ? 0 : state.activeSuggestion + 1;
    highlightSuggestion();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    state.activeSuggestion = state.activeSuggestion <= 0 ? max : state.activeSuggestion - 1;
    highlightSuggestion();
  } else if (e.key === "Enter") {
    if (state.activeSuggestion >= 0) {
      e.preventDefault();
      selectSuggestion(state.suggestions[state.activeSuggestion]);
    }
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

document.addEventListener("click", (e) => {
  if (!el.form.contains(e.target) && !el.suggestions.contains(e.target)) hideSuggestions();
});

el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = el.input.value.trim();
  if (state.suggestions.length) {
    selectSuggestion(state.suggestions[state.activeSuggestion >= 0 ? state.activeSuggestion : 0]);
    return;
  }
  if (!query) return;
  debouncedSuggest.cancel();
  const results = await fetchSuggestions(query);
  if (results.length) selectSuggestion(results[0]);
  else if (el.statusBanner.hidden) showBanner("No matching city found. Try a different spelling.");
});

// Press "/" anywhere to jump to the search box.
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) {
    e.preventDefault();
    el.input.focus();
    el.input.select();
  }
});

el.locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showBanner("Geolocation isn't supported in this browser.");
    return;
  }
  el.locateBtn.classList.add("loading");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        // A failed reverse geocode shouldn't block the weather — the old code
        // had no catch here, so it threw an unhandled rejection instead.
        let name = "Your location";
        let country = "";
        try {
          const place = asArray(await reverseGeocode(latitude, longitude))[0];
          if (place?.name) {
            name = place.name;
            country = place.country || "";
          }
        } catch {
          /* keep the generic label */
        }
        await loadWeather({ lat: latitude, lon: longitude, name, country });
      } finally {
        el.locateBtn.classList.remove("loading");
      }
    },
    (err) => {
      el.locateBtn.classList.remove("loading");
      const reason = err.code === err.PERMISSION_DENIED
        ? "Location permission was denied."
        : err.code === err.TIMEOUT
          ? "Locating you took too long."
          : "Couldn't determine your location.";
      showBanner(`${reason} Search for a city instead.`);
    },
    { timeout: 10000, maximumAge: 5 * 60 * 1000 }
  );
});

el.unitToggle.addEventListener("click", (e) => {
  const button = e.target.closest(".unit-option");
  if (!button || button.dataset.unit === state.unit) return;
  state.unit = button.dataset.unit;
  store.set(KEYS.unit, state.unit);
  renderUnitToggle();
  // Everything is stored in metric, so this is a pure re-render — no re-fetch,
  // no loading skeleton.
  if (state.data) render();
});

el.favBtn.addEventListener("click", () => toggleFavorite(state.place));

el.shareBtn.addEventListener("click", async () => {
  if (!state.place) return;
  syncUrl(state.place);
  const link = window.location.href;
  try {
    await navigator.clipboard.writeText(link);
    showBanner(`Link to ${placeLabel(state.place)} copied to your clipboard.`, { tone: "success" });
  } catch {
    showBanner(`Share this link: ${link}`, { tone: "info" });
  }
});

el.refreshBtn.addEventListener("click", () => {
  if (state.place) loadWeather(state.place, { silent: true, pushUrl: false });
});

el.hourlyReset.addEventListener("click", () => {
  if (state.selectedDay) selectDay(state.selectedDay);
});

el.statusRetry.addEventListener("click", () => {
  const action = retryAction;
  hideBanner();
  if (action) action();
});

el.statusDismiss.addEventListener("click", hideBanner);

window.addEventListener("resize", debounce(resizeCanvas, 150));
reduceMotion.addEventListener("change", startSky);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopSky();
    return;
  }
  startSky();
  // Catch up after the tab has been in the background for a while.
  if (state.place && state.data && Date.now() - state.data.fetchedAt > CONFIG.refreshMs) {
    loadWeather(state.place, { silent: true, pushUrl: false });
  }
});

window.addEventListener("online", () => {
  if (state.place && state.data?.stale) loadWeather(state.place, { silent: true, pushUrl: false });
});

window.addEventListener("offline", () => {
  showBanner("You're offline — showing the last data Skyline loaded.", { tone: "info" });
});

// ---------- Public helper (so a fork can use its own key) ----------
window.Skyline = {
  setApiKey(key) {
    if (typeof key !== "string" || key.trim().length < 8) {
      console.warn("Skyline.setApiKey: pass your OpenWeather API key as a string.");
      return;
    }
    store.set(KEYS.apiKey, key.trim());
    if (state.place) loadWeather(state.place);
    else console.info("Skyline: API key saved.");
  },
  clearApiKey() {
    store.remove(KEYS.apiKey);
  },
  reset() {
    Object.values(KEYS).forEach(store.remove);
    location.reload();
  },
};

// ---------- Init ----------
(function init() {
  const storedUnit = store.get(KEYS.unit, "metric");
  state.unit = UNITS[storedUnit] ? storedUnit : "metric";
  state.recent = asArray(store.get(KEYS.recent, [])).filter((r) => isNum(Number(r?.lat)) && isNum(Number(r?.lon)) && r?.name);
  state.favorites = asArray(store.get(KEYS.favorites, [])).filter((f) => isNum(Number(f?.lat)) && isNum(Number(f?.lon)) && f?.name);

  renderUnitToggle();
  renderPlaces();
  resizeCanvas();

  // Show cached data immediately, then refresh — the dashboard is never blank.
  const target = placeFromUrl() || state.favorites[0] || state.recent[0] || { lat: 22.5726, lon: 88.3639, name: "Kolkata", country: "IN" };
  const cached = readCache(target);
  if (cached) {
    state.place = normalisePlace(cached.place);
    state.data = { ...cached.payload, fetchedAt: cached.fetchedAt, stale: true };
    render();
    loadWeather(target, { silent: true });
  } else {
    loadWeather(target);
  }

  // Keep "updated 4 min ago", the local clock and the sun dot honest.
  clearInterval(state.tickTimer);
  state.tickTimer = setInterval(() => {
    if (document.hidden || !state.data?.current) return;
    updateMeta();
    renderSunArc(state.data.current, state.data.current.timezone || 0);
  }, 30000);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        /* offline support is optional; the app works without it */
      });
    });
  }
})();
