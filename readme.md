# Skyline — Weather Dashboard

A live weather dashboard built with vanilla HTML, CSS and JavaScript. Search any city (or use your current location) to see current conditions, an hourly and 5-day forecast, air quality, and a sunrise-to-sunset day tracker — all wrapped in a glassmorphic UI that shifts its colour palette and ambient sky animation to match the real weather.

> Originally started as a simple college project (single API call, static card). Rebuilt in 2026 with a real dashboard layout, more of the OpenWeather API surface, and a UI that reacts to live data instead of just displaying it.

## Features

- **City search with autocomplete** — debounced, keyboard-navigable suggestions from OpenWeather's Geocoding API, with request sequencing so a slow response can't overwrite a newer one.
- **"Use my location"** — one-tap geolocation with reverse geocoding for the place name.
- **Current conditions** — temperature, feels-like, high/low, humidity, wind (with direction and gusts), pressure, visibility, dew point, cloud cover and precipitation.
- **Air quality index** — from the Air Pollution API, with the PM2.5 reading behind it.
- **Sunrise → sunset tracker** — an arc widget plotting the current time between sunrise and sunset, plus how much daylight is left (or how long until sunrise).
- **5-day forecast + next-36-hours strip** — built from the 3-hour forecast endpoint, grouped by the city's own calendar day. Tap any day to break it down into its 3-hourly slots.
- **Temperature sparkline** — drawn across the hourly strip from measured cell positions, so it stays aligned at any zoom level.
- **Precipitation probability** — per 3-hour slot and per day.
- **Weather-reactive UI** — the background gradient, glass tint and canvas particle layer (rain, snow, twinkling stars, lightning) all follow the current condition and time of day.
- **°C / °F toggle** — instant, with no extra API calls: data is fetched once in metric and converted at render time. Imperial mode also switches to mph, miles and inHg.
- **Saved places and recent searches** — persisted in `localStorage`, each removable.
- **Shareable links** — the current place is reflected in the URL, so a city can be bookmarked or shared.
- **Offline-tolerant** — a service worker caches the app shell, and the last successful payload is replayed with a "cached" note if a request fails.
- **Auto-refresh** every 10 minutes, on tab focus, and when the connection returns.
- Fully responsive, keyboard-accessible (`/` focuses search), and respects `prefers-reduced-motion`.

## Tech stack

Plain HTML, CSS and JavaScript — no frameworks, no build step. The point of this rebuild was to show what's achievable with the fundamentals done well, not to add tooling for its own sake.

- **Fonts:** Space Grotesk (display), Inter (body), JetBrains Mono (data/labels)
- **APIs:** [OpenWeather](https://openweathermap.org/api) — Current Weather, 5 Day / 3 Hour Forecast, Geocoding, Air Pollution (all on the free tier)
- **Rendering:** a `<canvas>` layer for ambient particles, sitting behind a glassmorphic layout built with `backdrop-filter`

## Project structure

```text
WeatherApi/
├── index.html              # markup + structure
├── style.css               # design tokens, surface themes, layout, animations
├── script.js               # API layer, state, rendering, canvas particles
├── sw.js                   # service worker (app-shell cache)
├── manifest.webmanifest    # installable PWA metadata
├── icon.svg, favicon.svg   # app icons
└── readme.md
```

## Running it locally

No build step required.

```bash
git clone https://github.com/sdukesameer/WeatherApi.git
cd WeatherApi
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

Serve it over `http://` rather than opening `index.html` from the filesystem — service workers and URL parameters don't work on `file://`.

## API key

`script.js` ships with a demo OpenWeather key so the dashboard works the moment you clone it. **A key committed to a public repo is a public key** — anyone can read it out of the JS bundle or the git history, and burn through its quota. If you fork this, use your own:

```js
// in the browser console, once — stored in localStorage
Skyline.setApiKey("your-key-here");
```

That takes precedence over the bundled key without editing any files. Other helpers: `Skyline.clearApiKey()` and `Skyline.reset()`.

A static site fundamentally cannot keep a key secret — the only real fix is a small backend that holds the key and proxies the requests. That's the honest answer to the question in an interview, and it's why the key here is a throwaway.

## How it works (talking points)

- **Autocomplete → coordinates → three parallel requests.** Selecting a city resolves to a lat/lon pair, which is used to call current weather, forecast and air pollution together with `Promise.allSettled` — so a failed air-quality call still leaves you with live conditions, rather than sinking the whole render.
- **One canonical unit.** Everything is fetched in metric and converted at render time. Switching °C/°F is a pure re-render: no network, no skeleton.
- **Condition → theme mapping.** Each `weather.main` value (plus the day/night suffix on the icon code) maps to a condition key that tints a time-of-day palette. JS owns the gradient; CSS owns ink and glass.
- **Contrast is computed, not guessed.** Because the backdrop is live data, it can land anywhere from near-black to near-white. The app measures the WCAG relative luminance of the gradient and flips a `data-surface` attribute at 0.197 — the point where dark and light ink give equal contrast — and the glass panels carry a scrim so text contrast depends on the panel rather than on today's weather.
- **Timezone handling.** Every city time is derived by shifting the UTC instant by the city's own offset and reading it back with the `getUTC*` family, so the viewer's own timezone never leaks into a city's clock or calendar day.
- **Sun position math.** The dot's position comes from `(now - sunrise) / (sunset - sunrise)` placed on the SVG path with `getPointAtLength`. Above the Arctic Circle the API can report `sunrise === sunset`, which is special-cased rather than dividing by zero.
- **Forecast grouping.** The forecast endpoint returns 3-hour steps, so the daily view groups them by local calendar day and picks the slot closest to 1pm as that day's representative reading. Days at either end of the window are partial and marked as such.
- **Cancellation over racing.** Each new search aborts the previous request instead of letting it land late and overwrite fresher data.

## Known limitations

- The API key is client-side, as described above — fine for a demo, not for production.
- Free-tier OpenWeather forecasts are 3-hourly, not truly hourly (the "hourly" strip is the raw 3-hour steps).
- OpenWeather's geocoder matches whole city names, not prefixes — `"new yor"` returns nothing, so the dropdown says so instead of appearing broken.
- UV index needs the One Call 3.0 subscription, so it isn't shown.
- Today's high/low can only be built from the readings that remain in the day; late in the evening the app switches to a rolling 24-hour window and labels it.

## Author

Built by Sameer · 2026
