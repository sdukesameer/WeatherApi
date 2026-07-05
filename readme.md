# Skyline — Weather Dashboard

A live weather dashboard built with vanilla HTML, CSS and JavaScript. Search any city (or use your current location) to see current conditions, an hourly and 5-day forecast, air quality, and a sunrise-to-sunset day tracker — all wrapped in a glassmorphic UI that shifts its color palette and ambient sky animation to match the real weather.

> Originally started as a simple college project (single API call, static card). Rebuilt in 2026 with a real dashboard layout, more of the OpenWeather API surface, and a UI that reacts to live data instead of just displaying it.

## Features

- **City search with autocomplete** — debounced, keyboard-navigable suggestions from OpenWeather's Geocoding API.
- **"Use my location"** — one-tap geolocation with reverse geocoding for the place name.
- **Current conditions** — temperature, feels-like, humidity, wind, pressure, visibility, cloud cover.
- **Air quality index** — pulled from the Air Pollution API and shown as Good / Fair / Moderate / Poor / Very Poor.
- **Sunrise → sunset tracker** — an arc widget that plots the current time of day between sunrise and sunset.
- **5-day forecast + next-8-hours strip** — built from the 3-hour forecast endpoint, grouped by local calendar day.
- **Weather-reactive UI** — background gradient, glass tint and an animated canvas layer (rain, snow, or a twinkling star field) all change based on the current condition and day/night.
- **°C / °F toggle**, **recent searches** (persisted in `localStorage`), graceful loading skeletons and error banners.
- Fully responsive, keyboard-accessible, and respects `prefers-reduced-motion`.

## Tech stack

Plain HTML, CSS and JavaScript — no frameworks, no build step. The point of this rebuild was to show what's achievable with the fundamentals done well, not to add tooling for its own sake.

- **Fonts:** Space Grotesk (display), Inter (body), JetBrains Mono (data/labels)
- **APIs:** [OpenWeather](https://openweathermap.org/api) — Current Weather, 5 Day / 3 Hour Forecast, Geocoding, Air Pollution (all on the free tier)
- **Rendering:** a `<canvas>` layer for ambient particles, sitting behind a glassmorphic layout built with `backdrop-filter`

## Project structure

```
weather-app/
├── index.html      # markup + structure
├── style.css       # design tokens, condition themes, layout, animations
├── script.js       # API calls, state, rendering, canvas particles
├── index.php       # thin PHP wrapper (includes index.html) from the original setup
└── README.md
```

## Running it locally

No build step required.

```bash
git clone https://github.com/sdukesameer/WeatherApi.git
cd WeatherApi
# open index.html directly, or serve it:
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## API key

`script.js` ships with a working OpenWeather API key for convenience since this is a static, backend-less demo. If you fork this, swap in your own free key from [openweathermap.org/api](https://openweathermap.org/api) and, ideally, keep it out of source control — a key embedded in client-side JS is always publicly visible, which is a real limitation of static sites worth knowing for an interview.

## How it works (talking points)

- **Autocomplete → coordinates → three parallel requests.** Selecting a city (or using geolocation) resolves to a lat/lon pair, which is then used to call the current weather, forecast and air pollution endpoints together with `Promise.all`, rather than chaining them one after another.
- **Condition → theme mapping.** Each OpenWeather `weather.main` value (plus the day/night suffix on the icon code) maps to one of seven condition keys, which drive a `data-condition` attribute on `<body>`. CSS custom properties swap per condition, so the whole palette updates without touching JS.
- **Sun position math.** The sunrise/sunset arc isn't decorative — the dot's position is computed from `(now - sunrise) / (sunset - sunrise)` and placed on the SVG path with `getPointAtLength`, so it's an accurate read of how far through the day you are.
- **Forecast grouping.** The forecast endpoint only returns 3-hour steps, so the daily forecast groups those by local calendar day (using the city's UTC offset) and picks the slot closest to 1pm as the representative icon/condition for that day.
- **Everything is one file each.** No bundler — `script.js` is organized top-to-bottom as config → state → DOM refs → icons → canvas → helpers → event listeners → data fetching/rendering, so it reads like the mental model of the app.

## Known limitations

- The API key is client-side, as noted above — fine for a demo, not for production.
- Free-tier OpenWeather forecasts are 3-hourly, not truly hourly (the "hourly" strip is the raw 3-hour steps).
- No offline/PWA support.

## Author

Built by Sameer · 2026
