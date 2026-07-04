// =========================================================
// Skyline — Weather Dashboard
// Vanilla JS · OpenWeather API (Geocoding, Current, Forecast, Air Pollution)
// =========================================================

const CONFIG = {
  // NOTE: this is a client-only static project, so the key is necessarily
  // visible in the browser. For anything beyond a demo/portfolio piece,
  // proxy requests through a tiny backend instead.
  apiKey: "c83a00a0e97d817f5c832504db83af6e",
  base: "https://api.openweathermap.org",
  recentLimit: 5,
};

const state = {
  unit: localStorage.getItem("skyline:unit") || "metric",
  recent: JSON.parse(localStorage.getItem("skyline:recent") || "[]"),
  activeSuggestion: -1,
  suggestions: [],
  debounceTimer: null,
};

// ---------- DOM refs ----------
const el = {
  form: document.getElementById("search-form"),
  input: document.getElementById("search-input"),
  suggestions: document.getElementById("suggestions"),
  locateBtn: document.getElementById("locate-btn"),
  unitToggle: document.getElementById("unit-toggle"),
  recentChips: document.getElementById("recent-chips"),
  statusBanner: document.getElementById("status-banner"),
  dashboard: document.getElementById("dashboard"),
  skeleton: document.getElementById("skeleton"),

  cityName: document.getElementById("city-name"),
  cityMeta: document.getElementById("city-meta"),
  conditionIcon: document.getElementById("condition-icon"),
  temp: document.getElementById("temp"),
  conditionLabel: document.getElementById("condition-label"),
  feelsLike: document.getElementById("feels-like"),
  sunDot: document.getElementById("sun-dot"),
  sunArcPath: document.querySelector(".sun-arc path"),
  sunriseLabel: document.getElementById("sunrise-label"),
  sunsetLabel: document.getElementById("sunset-label"),

  statHumidity: document.getElementById("stat-humidity"),
  statWind: document.getElementById("stat-wind"),
  statPressure: document.getElementById("stat-pressure"),
  statVisibility: document.getElementById("stat-visibility"),
  statAqi: document.getElementById("stat-aqi"),
  statClouds: document.getElementById("stat-clouds"),

  forecastStrip: document.getElementById("forecast-strip"),
  hourlyStrip: document.getElementById("hourly-strip"),
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

function iconFor(main, iconCode) {
  const isNight = iconCode?.endsWith("n");
  switch (main) {
    case "Clear": return isNight ? ICONS.moon : ICONS.sun;
    case "Clouds": return isNight ? ICONS.cloud : ICONS.cloudSun;
    case "Rain":
    case "Drizzle": return ICONS.rain;
    case "Thunderstorm": return ICONS.thunder;
    case "Snow": return ICONS.snow;
    default: return ICONS.mist; // Mist, Smoke, Haze, Fog, Dust, Sand, Ash, Squall, Tornado
  }
}

function conditionKey(main, iconCode) {
  const isNight = iconCode?.endsWith("n");
  switch (main) {
    case "Clear": return isNight ? "clear-night" : "clear-day";
    case "Clouds": return "clouds";
    case "Rain":
    case "Drizzle": return "rain";
    case "Thunderstorm": return "thunderstorm";
    case "Snow": return "snow";
    default: return "mist";
  }
}

// ---------- Time-of-day sky gradient ----------
const SKY_PHASES = {
    night: { bg: ["#050912", "#131c30"], accent: "#6f93ff" },
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
    snow: { toward: "#eef3f9", amount: 0.55 },
    mist: { toward: "#9aa3ac", amount: 0.45 },
};
function getSkyPhase(now, sunrise, sunset) {
    const twilight = 45 * 60;
    if (now < sunrise - twilight || now > sunset + twilight) return "night";
    if (now < sunrise + twilight) return "dawn";
    if (now > sunset - twilight) return "dusk";
    const progress = (now - sunrise) / (sunset - sunrise);
    if (progress < 0.35) return "morning";
    if (progress < 0.65) return "midday";
    return "afternoon";
}
function hexToRgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const mix = a.map((c, i) => Math.round(c + (b[i] - c) * t));
    return `rgb(${mix.join(",")})`;
}
function applySkyTheme(main, iconCode, sunrise, sunset, now) {
    const phase = getSkyPhase(now, sunrise, sunset);
    const { bg: [bg1Base, bg2Base], accent } = SKY_PHASES[phase];
    const tint = CONDITION_TINTS[conditionKey(main, iconCode)];
    const bg1 = tint ? lerpColor(bg1Base, tint.toward, tint.amount) : bg1Base;
    const bg2 = tint ? lerpColor(bg2Base, tint.toward, tint.amount) : bg2Base;
    document.body.style.setProperty("--bg-1", bg1);
    document.body.style.setProperty("--bg-2", bg2);
    document.body.style.setProperty("--accent", accent);
}

// ---------- Sky canvas (ambient particles) ----------
const canvas = document.getElementById("sky-canvas");
const ctx = canvas.getContext("2d");
let particles = [];
let skyMode = "clear-day";

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function seedParticles(mode) {
  skyMode = mode;
  particles = [];
  const w = canvas.width, h = canvas.height;
  if (mode === "rain" || mode === "thunderstorm") {
    for (let i = 0; i < 110; i++) {
      particles.push({ x: Math.random() * w, y: Math.random() * h, len: 10 + Math.random() * 14, speed: 6 + Math.random() * 6 });
    }
  } else if (mode === "snow") {
    for (let i = 0; i < 90; i++) {
      particles.push({ x: Math.random() * w, y: Math.random() * h, r: 1.5 + Math.random() * 2.5, speed: 0.6 + Math.random() * 1.2, drift: Math.random() * 1 - 0.5 });
    }
  } else if (mode === "clear-night") {
    for (let i = 0; i < 70; i++) {
      particles.push({ x: Math.random() * w, y: Math.random() * h * 0.7, r: Math.random() * 1.4, tw: Math.random() * Math.PI * 2 });
    }
  } else {
    particles = [];
  }
}

function drawFrame() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (skyMode === "rain" || skyMode === "thunderstorm") {
    ctx.strokeStyle = "rgba(180, 220, 255, 0.35)";
    ctx.lineWidth = 1.4;
    particles.forEach((p) => {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 2, p.y + p.len);
      ctx.stroke();
      p.y += p.speed;
      if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
    });
  } else if (skyMode === "snow") {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    particles.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.y += p.speed;
      p.x += p.drift;
      if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
    });
  } else if (skyMode === "clear-night") {
    particles.forEach((p) => {
      p.tw += 0.02;
      const alpha = 0.4 + Math.sin(p.tw) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, alpha)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  requestAnimationFrame(drawFrame);
}
requestAnimationFrame(drawFrame);

// ---------- Helpers ----------
function debounce(fn, wait) {
  return (...args) => {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => fn(...args), wait);
  };
}

function showBanner(message) {
  el.statusBanner.textContent = message;
  el.statusBanner.hidden = false;
}
function hideBanner() {
  el.statusBanner.hidden = true;
}

function setLoading(isLoading) {
  el.skeleton.classList.toggle("active", isLoading);
  el.dashboard.classList.toggle("hidden", isLoading);
}

function kmh(speedMs, unit) {
  // OpenWeather returns m/s for metric, mph for imperial
  return unit === "metric" ? Math.round(speedMs * 3.6) : Math.round(speedMs);
}

function formatTime(unixSeconds, tzOffsetSeconds) {
  const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function aqiLabel(aqi) {
  return { 1: "Good", 2: "Fair", 3: "Moderate", 4: "Poor", 5: "Very Poor" }[aqi] || "--";
}

// ---------- Recent searches ----------
function saveRecent(entry) {
  state.recent = state.recent.filter((r) => r.name !== entry.name || r.country !== entry.country);
  state.recent.unshift(entry);
  state.recent = state.recent.slice(0, CONFIG.recentLimit);
  localStorage.setItem("skyline:recent", JSON.stringify(state.recent));
  renderRecent();
}

function renderRecent() {
  el.recentChips.innerHTML = "";
  state.recent.forEach((r) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = `${r.name}${r.country ? ", " + r.country : ""}`;
    chip.addEventListener("click", () => loadWeather(r.lat, r.lon, r.name, r.country));
    el.recentChips.appendChild(chip);
  });
}

// ---------- Geocoding autocomplete ----------
async function fetchSuggestions(query) {
  if (!query || query.length < 2) {
    hideSuggestions();
    return;
  }
  try {
    const url = `${CONFIG.base}/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${CONFIG.apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    state.suggestions = Array.isArray(data) ? data : [];
    renderSuggestions();
  } catch {
    hideSuggestions();
  }
}

function renderSuggestions() {
  state.activeSuggestion = -1;
  el.suggestions.innerHTML = "";
  if (state.suggestions.length === 0) {
    hideSuggestions();
    return;
  }
  state.suggestions.forEach((s, i) => {
    const li = document.createElement("li");
    li.role = "option";
    li.id = `suggestion-${i}`;
    li.innerHTML = `<span>${s.name}</span><span class="sub">${[s.state, s.country].filter(Boolean).join(", ")}</span>`;
    li.addEventListener("click", () => selectSuggestion(s));
    el.suggestions.appendChild(li);
  });
  el.suggestions.hidden = false;
  el.input.setAttribute("aria-expanded", "true");
}

function hideSuggestions() {
  el.suggestions.hidden = true;
  el.suggestions.innerHTML = "";
  el.input.setAttribute("aria-expanded", "false");
  state.suggestions = [];
  state.activeSuggestion = -1;
}

function selectSuggestion(s) {
  el.input.value = `${s.name}${s.country ? ", " + s.country : ""}`;
  hideSuggestions();
  loadWeather(s.lat, s.lon, s.name, s.country);
}

el.input.addEventListener("input", debounce((e) => fetchSuggestions(e.target.value.trim()), 300));

el.input.addEventListener("keydown", (e) => {
  if (el.suggestions.hidden) return;
  const max = state.suggestions.length - 1;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    state.activeSuggestion = Math.min(max, state.activeSuggestion + 1);
    highlightSuggestion();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    state.activeSuggestion = Math.max(0, state.activeSuggestion - 1);
    highlightSuggestion();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (state.activeSuggestion >= 0) selectSuggestion(state.suggestions[state.activeSuggestion]);
    else if (state.suggestions[0]) selectSuggestion(state.suggestions[0]);
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

function highlightSuggestion() {
  [...el.suggestions.children].forEach((li, i) => {
    li.setAttribute("aria-selected", i === state.activeSuggestion ? "true" : "false");
  });
}

document.addEventListener("click", (e) => {
  if (!el.form.contains(e.target) && !el.suggestions.contains(e.target)) hideSuggestions();
});

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.suggestions[0]) {
    selectSuggestion(state.suggestions[0]);
  } else if (el.input.value.trim()) {
    fetchSuggestions(el.input.value.trim()).then(() => {
      if (state.suggestions[0]) selectSuggestion(state.suggestions[0]);
      else showBanner("No matching city found. Try a different spelling.");
    });
  }
});

// ---------- Geolocation ----------
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
        const url = `${CONFIG.base}/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${CONFIG.apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        const place = data[0] || {};
        loadWeather(latitude, longitude, place.name || "Your location", place.country);
      } finally {
        el.locateBtn.classList.remove("loading");
      }
    },
    () => {
      el.locateBtn.classList.remove("loading");
      showBanner("Couldn't access your location. Check browser permissions.");
    }
  );
});

// ---------- Unit toggle ----------
el.unitToggle.addEventListener("click", (e) => {
  const target = e.target.closest(".unit-option");
  if (!target) return;
  const unit = target.dataset.unit;
  if (unit === state.unit) return;
  state.unit = unit;
  localStorage.setItem("skyline:unit", unit);
  [...el.unitToggle.children].forEach((c) => c.classList.toggle("active", c.dataset.unit === unit));
  if (state.lastCoords) loadWeather(state.lastCoords.lat, state.lastCoords.lon, state.lastCoords.name, state.lastCoords.country);
});

// ---------- Core data fetch + render ----------
async function loadWeather(lat, lon, name, country) {
  hideBanner();
  setLoading(true);
  state.lastCoords = { lat, lon, name, country };

  try {
    const [currentRes, forecastRes, airRes] = await Promise.all([
      fetch(`${CONFIG.base}/data/2.5/weather?lat=${lat}&lon=${lon}&units=${state.unit}&appid=${CONFIG.apiKey}`),
      fetch(`${CONFIG.base}/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${state.unit}&appid=${CONFIG.apiKey}`),
      fetch(`${CONFIG.base}/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${CONFIG.apiKey}`),
    ]);

    if (!currentRes.ok) throw new Error("Weather data unavailable for this location.");

    const current = await currentRes.json();
    const forecast = forecastRes.ok ? await forecastRes.json() : null;
    const air = airRes.ok ? await airRes.json() : null;

    renderCurrent(current, name, country);
    if (forecast) {
      renderDailyForecast(forecast, current.timezone);
      renderHourly(forecast, current.timezone);
    }
    if (air) renderAir(air);

    saveRecent({ name: current.name || name, country: current.sys?.country || country, lat, lon });
  } catch (err) {
    showBanner(err.message || "Something went wrong fetching the weather.");
  } finally {
    setLoading(false);
  }
}

function renderCurrent(data, fallbackName) {
  const w = data.weather[0];
  const key = conditionKey(w.main, w.icon);
  document.body.setAttribute("data-condition", key);
  seedParticles(key);
  applySkyTheme(w.main, w.icon, data.sys.sunrise, data.sys.sunset, data.dt);

  el.cityName.textContent = data.name || fallbackName;
  el.cityMeta.textContent = new Date((data.dt + data.timezone) * 1000).toUTCString().replace(" GMT", " local time");
  el.conditionIcon.innerHTML = iconFor(w.main, w.icon);
  el.temp.textContent = `${Math.round(data.main.temp)}°`;
  el.conditionLabel.textContent = w.description;
  el.feelsLike.textContent = `Feels like ${Math.round(data.main.feels_like)}°`;

  el.statHumidity.textContent = `${data.main.humidity}%`;
  el.statWind.textContent = `${kmh(data.wind.speed, state.unit)} ${state.unit === "metric" ? "km/h" : "mph"}`;
  el.statPressure.textContent = `${data.main.pressure} hPa`;
  el.statVisibility.textContent = `${(data.visibility / 1000).toFixed(1)} km`;
  el.statClouds.textContent = `${data.clouds.all}%`;

  el.sunriseLabel.textContent = formatTime(data.sys.sunrise, data.timezone);
  el.sunsetLabel.textContent = formatTime(data.sys.sunset, data.timezone);
  positionSunDot(data.sys.sunrise, data.sys.sunset, data.dt);
}

function positionSunDot(sunrise, sunset, now) {
  const path = el.sunArcPath;
  if (!path) return;
  const total = path.getTotalLength();
  let pct = (now - sunrise) / (sunset - sunrise);
  pct = Math.min(1, Math.max(0, pct));
  const point = path.getPointAtLength(total * pct);
  el.sunDot.setAttribute("cx", point.x);
  el.sunDot.setAttribute("cy", point.y);
}

function renderAir(air) {
  const aqi = air.list?.[0]?.main?.aqi;
  el.statAqi.textContent = aqi ? aqiLabel(aqi) : "--";
}

function renderDailyForecast(forecast, tzOffset) {
  // Group 3-hour slots by local calendar day, take midday-ish reading + min/max
  const days = {};
  forecast.list.forEach((item) => {
    const localDate = new Date((item.dt + tzOffset) * 1000);
    const key = localDate.toISOString().slice(0, 10);
    if (!days[key]) days[key] = [];
    days[key].push(item);
  });

  const todayKey = new Date((forecast.list[0].dt + tzOffset) * 1000).toISOString().slice(0, 10);
  const entries = Object.entries(days).filter(([key]) => key !== todayKey).slice(0, 5);

  el.forecastStrip.innerHTML = "";
  entries.forEach(([key, items]) => {
    const temps = items.map((i) => i.main.temp);
    const midday = items.reduce((best, i) => {
      const hour = new Date((i.dt + tzOffset) * 1000).getUTCHours();
      return Math.abs(hour - 13) < Math.abs(new Date((best.dt + tzOffset) * 1000).getUTCHours() - 13) ? i : best;
    }, items[0]);

    const card = document.createElement("div");
    card.className = "forecast-day";
    card.innerHTML = `
      <span class="day-name">${new Date(key).toLocaleDateString(undefined, { weekday: "short" })}</span>
      ${iconFor(midday.weather[0].main, midday.weather[0].icon)}
      <span class="day-temp">${Math.round(Math.max(...temps))}° <span class="lo">${Math.round(Math.min(...temps))}°</span></span>
    `;
    el.forecastStrip.appendChild(card);
  });
}

function renderHourly(forecast, tzOffset) {
  el.hourlyStrip.innerHTML = "";
  forecast.list.slice(0, 8).forEach((item) => {
    const local = new Date((item.dt + tzOffset) * 1000);
    const hourEl = document.createElement("div");
    hourEl.className = "hourly-item";
    hourEl.innerHTML = `
      <span class="hour-label">${local.getUTCHours().toString().padStart(2, "0")}:00</span>
      ${iconFor(item.weather[0].main, item.weather[0].icon)}
      <span class="hour-temp">${Math.round(item.main.temp)}°</span>
    `;
    el.hourlyStrip.appendChild(hourEl);
  });
}

// ---------- Init ----------
(function init() {
  [...el.unitToggle.children].forEach((c) => c.classList.toggle("active", c.dataset.unit === state.unit));
  renderRecent();

  const last = state.recent[0];
  if (last) {
    loadWeather(last.lat, last.lon, last.name, last.country);
  } else {
    // Default city so the dashboard isn't empty on first visit
    fetchSuggestions("Kolkata").then(() => {
      // Fallback fixed coordinates for Kolkata in case geocoding is slow/unavailable
      loadWeather(22.5726, 88.3639, "Kolkata", "IN");
    });
  }
})();
