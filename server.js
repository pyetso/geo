"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!response.ok) {
    const message = data?.message || data?.error?.message || text.slice(0, 180) || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function sample(array, count = 1) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const WORLD_LOCATIONS = [
  { city: "Toronto", country: "Canada" }, { city: "Vancouver", country: "Canada" },
  { city: "New York", country: "United States" }, { city: "Chicago", country: "United States" },
  { city: "London", country: "United Kingdom" }, { city: "Manchester", country: "United Kingdom" },
  { city: "Paris", country: "France" }, { city: "Marseille", country: "France" },
  { city: "Berlin", country: "Germany" }, { city: "Munich", country: "Germany" },
  { city: "Rome", country: "Italy" }, { city: "Milan", country: "Italy" },
  { city: "Madrid", country: "Spain" }, { city: "Barcelona", country: "Spain" },
  { city: "Tokyo", country: "Japan" }, { city: "Osaka", country: "Japan" },
  { city: "Sydney", country: "Australia" }, { city: "Melbourne", country: "Australia" },
  { city: "Delhi", country: "India" }, { city: "Mumbai", country: "India" },
  { city: "São Paulo", country: "Brazil" }, { city: "Rio de Janeiro", country: "Brazil" },
  { city: "Mexico City", country: "Mexico" }, { city: "Cape Town", country: "South Africa" },
  { city: "Johannesburg", country: "South Africa" }, { city: "Dublin", country: "Ireland" },
  { city: "Amsterdam", country: "Netherlands" }, { city: "Stockholm", country: "Sweden" },
  { city: "Seoul", country: "South Korea" }, { city: "Singapore", country: "Singapore" }
];

const COUNTRY_POOL = [...new Set(WORLD_LOCATIONS.map(x => x.country))];
const CITY_POOL = WORLD_LOCATIONS.map(x => x.city);

function redactTerms(text, terms) {
  let output = String(text || "");
  for (const term of terms.filter(Boolean).sort((a, b) => b.length - a.length)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[location]");
  }
  return output;
}

const geocodeCache = new Map();
let lastNominatim = 0;
async function geocode(query) {
  if (geocodeCache.has(query)) return geocodeCache.get(query);
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatim));
  if (wait) await sleep(wait);
  lastNominatim = Date.now();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  const data = await fetchJson(url, { headers: { "User-Agent": "GeoHubPrototype/1.0 (local educational project)" } });
  const first = data?.[0];
  const result = first ? {
    lat: Number(first.lat), lon: Number(first.lon),
    country: first.address?.country || null,
    countryCode: String(first.address?.country_code || "").toUpperCase(),
    city: first.address?.city || first.address?.town || first.address?.municipality || first.address?.village || null,
    displayName: first.display_name || query
  } : null;
  geocodeCache.set(query, result);
  return result;
}

async function newsQuestion() {
  const key = process.env.NEWS_API_KEY;
  if (!key) return { ready: false, error: "Add NEWS_API_KEY to .env" };

  for (let attempt = 0; attempt < 12; attempt++) {
    const target = sample(WORLD_LOCATIONS)[0];
    const geo = await geocode(`${target.city}, ${target.country}`);
    if (!geo) continue;

    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.set("q", `"${target.city}"`);
    url.searchParams.set("searchIn", "title,description");
    url.searchParams.set("language", "en");
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("pageSize", "30");
    const data = await fetchJson(url, { headers: { "X-Api-Key": key } });
    const candidates = (data.articles || []).filter(a => {
      if (!a?.title || a.title === "[Removed]") return false;
      return a.title.toLowerCase().includes(target.city.toLowerCase());
    });
    if (!candidates.length) continue;

    const article = sample(candidates.slice(0, 15))[0];
    const redactionTerms = [target.city, target.country, geo.city, geo.country];
    const title = redactTerms(article.title, redactionTerms);
    const description = redactTerms(article.description || "", redactionTerms);
    if (!title.includes("[location]")) continue;

    const answer = target.country;
    const wrong = sample(COUNTRY_POOL.filter(x => x !== answer), 3);
    return {
      ready: true,
      kind: "country",
      prompt: "Which country is this headline from?",
      title,
      description,
      source: article.source?.name || "News source",
      publishedAt: article.publishedAt || null,
      url: article.url || null,
      answer,
      options: sample([answer, ...wrong], 4),
      reveal: `${target.city}, ${target.country}`,
      geocoded: { lat: geo.lat, lon: geo.lon }
    };
  }
  throw new Error("NewsAPI returned stories, but none had a clean headline location clue. Try the next story.");
}

async function airportGeo(airport, iata) {
  if (!airport && !iata) return null;
  return geocode(`${airport || ""} ${iata || ""} airport`);
}

async function flightQuestion() {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return { ready: false, error: "Add AVIATIONSTACK_API_KEY to .env" };

  const url = new URL("https://api.aviationstack.com/v1/flights");
  url.searchParams.set("access_key", key);
  url.searchParams.set("limit", "100");
  url.searchParams.set("flight_status", "active");
  const data = await fetchJson(url);
  const activeFlights = (data.data || []).filter(f =>
    f?.departure?.airport && f?.arrival?.airport && f?.departure?.iata && f?.arrival?.iata &&
    f.departure.iata !== f.arrival.iata
  );
  if (!activeFlights.length) throw new Error("Aviationstack did not return a usable active route on this request.");

  const liveFlights = activeFlights.filter(f =>
    f?.live && Number.isFinite(Number(f.live.latitude)) && Number.isFinite(Number(f.live.longitude))
  );
  const candidates = liveFlights.length ? liveFlights : activeFlights;

  for (const correct of sample(candidates, Math.min(14, candidates.length))) {
    const depGeo = await airportGeo(correct.departure.airport, correct.departure.iata);
    const arrGeo = await airportGeo(correct.arrival.airport, correct.arrival.iata);
    if (!depGeo?.country || !arrGeo?.country || depGeo.country === arrGeo.country) continue;

    const askOrigin = Math.random() < 0.5;
    const answer = askOrigin ? depGeo.country : arrGeo.country;
    const wrong = sample(COUNTRY_POOL.filter(c => c !== answer && c !== (askOrigin ? arrGeo.country : depGeo.country)), 3);
    while (wrong.length < 3) wrong.push(...sample(COUNTRY_POOL.filter(c => c !== answer && !wrong.includes(c)), 1));

    const live = correct.live && Number.isFinite(Number(correct.live.latitude)) && Number.isFinite(Number(correct.live.longitude))
      ? {
          lat: Number(correct.live.latitude), lon: Number(correct.live.longitude),
          altitudeM: Number(correct.live.altitude || 0),
          speedKmh: Number(correct.live.speed_horizontal || 0),
          direction: Number(correct.live.direction || 0),
          updated: correct.live.updated || null,
          onGround: Boolean(correct.live.is_ground)
        }
      : null;

    return {
      ready: true,
      flight: correct.flight?.iata || correct.flight?.icao || correct.flight?.number || "Active flight",
      airline: correct.airline?.name || "Airline",
      prompt: askOrigin ? "Which country did this aircraft depart from?" : "Which country is this aircraft flying to?",
      answer,
      options: sample([answer, ...wrong.slice(0, 3)], 4),
      live,
      status: correct.flight_status || "active",
      route: {
        departure: { lat: depGeo.lat, lon: depGeo.lon, iata: correct.departure.iata, airport: correct.departure.airport },
        arrival: { lat: arrGeo.lat, lon: arrGeo.lon, iata: correct.arrival.iata, airport: correct.arrival.airport }
      },
      reveal: `${correct.departure.airport} (${correct.departure.iata}), ${depGeo.country} → ${correct.arrival.airport} (${correct.arrival.iata}), ${arrGeo.country}`
    };
  }
  throw new Error("Could not geocode both ends of an active route. Click New question to try another aircraft.");
}
function channelIdFromHref(href) {
  if (!href) return null;
  return String(href).split("/").filter(Boolean).pop() || null;
}

async function radioGardenQuestion() {
  const placesPayload = await fetchJson("https://radio.garden/api/ara/content/places");
  const places = (placesPayload?.data?.list || []).filter(p => p?.id && p?.country && p?.title && Number(p?.size || 0) > 0);
  for (let attempt = 0; attempt < 8; attempt++) {
    const place = sample(places)[0];
    const payload = await fetchJson(`https://radio.garden/api/ara/content/page/${encodeURIComponent(place.id)}/channels`);
    const groups = Array.isArray(payload?.data?.content) ? payload.data.content : [];
    const channels = groups.flatMap(group => Array.isArray(group?.items) ? group.items : []).filter(ch => ch?.href && ch?.title);
    if (!channels.length) continue;
    const station = sample(channels)[0];
    const channelId = channelIdFromHref(station.href);
    if (!channelId) continue;
    const wrongCountries = sample([...new Set(places.map(p => p.country).filter(c => c && c !== place.country))], 3);
    if (wrongCountries.length < 3) continue;
    return {
      ready: true, provider: "Radio Garden", station: station.title, place: place.title,
      answer: place.country, options: sample([place.country, ...wrongCountries], 4),
      stream: `/api/radio-stream?channel=${encodeURIComponent(channelId)}`
    };
  }
  throw new Error("Radio Garden did not return a usable station.");
}

const RADIO_BROWSER_HOSTS = [
  "https://all.api.radio-browser.info",
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info"
];
const radioStreamCache = new Map();
function rememberRadioStream(stationUuid, streamUrl) {
  if (!stationUuid || !streamUrl) return;
  radioStreamCache.set(stationUuid, { streamUrl, expiresAt: Date.now() + 10 * 60 * 1000 });
}
function cachedRadioStream(stationUuid) {
  const hit = radioStreamCache.get(stationUuid);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) { radioStreamCache.delete(stationUuid); return null; }
  return hit.streamUrl;
}

async function radioBrowserFetch(pathname, params = {}) {
  let lastError;
  for (const host of RADIO_BROWSER_HOSTS) {
    try {
      const url = new URL(`${host}${pathname}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
      const data = await fetchJson(url, { headers: { "User-Agent": "GeoHubRadio/1.1" } });
      if (Array.isArray(data) && data.length) return data;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("Radio Browser is temporarily unavailable.");
}

async function radioBrowserQuestion() {
  const stations = await radioBrowserFetch("/json/stations/search", {
    hidebroken: "true",
    order: "random",
    limit: "250"
  });

  const usable = stations.filter(s =>
    s?.stationuuid && s?.url_resolved && s?.country && String(s.lastcheckok) !== "0" &&
    /^(https?:)/i.test(s.url_resolved) && /mp3|aac|ogg/i.test(String(s.codec || "")) &&
    String(s.hls ?? "0") !== "1"
  );
  if (usable.length < 4) throw new Error("Radio Browser returned too few playable stations.");

  // Prefer stations that Radio Browser has recently verified and that have a real bitrate.
  const preferred = usable.filter(s => Number(s.bitrate || 0) > 0 && Number(s.clickcount || 0) > 0);
  const pool = preferred.length >= 4 ? preferred : usable;
  const station = sample(pool)[0];
  rememberRadioStream(station.stationuuid, station.url_resolved);
  const countries = [...new Set(pool.map(s => s.country).filter(Boolean))];
  const wrong = sample(countries.filter(c => c !== station.country), 3);
  if (wrong.length < 3) throw new Error("Radio Browser did not have enough country choices.");

  return {
    ready: true,
    provider: "Radio Browser",
    station: station.name || "Mystery station",
    place: station.state || "Unknown city",
    answer: station.country,
    options: sample([station.country, ...wrong], 4),
    stream: `/api/radio-stream?provider=browser&station=${encodeURIComponent(station.stationuuid)}`
  };
}

async function radioQuestion() {
  // Radio Browser is the primary source because its health metadata lets us avoid broken streams.
  // Radio Garden remains a fallback when its public endpoints are available.
  try {
    return await radioBrowserQuestion();
  } catch (browserError) {
    try {
      return await radioGardenQuestion();
    } catch (gardenError) {
      throw new Error(`Could not connect to a station. Radio Browser: ${browserError.message}. Radio Garden: ${gardenError.message}.`);
    }
  }
}

async function resolveRadioBrowserStream(stationUuid) {
  if (!stationUuid || !/^[A-Za-z0-9-]{6,80}$/.test(stationUuid)) throw new Error("Invalid radio station.");
  const cached = cachedRadioStream(stationUuid);
  if (cached) return cached;
  const rows = await radioBrowserFetch(`/json/stations/byuuid/${encodeURIComponent(stationUuid)}`);
  const station = rows.find(s => s?.stationuuid === stationUuid) || rows[0];
  if (!station?.url_resolved || !/^(https?:)/i.test(station.url_resolved)) throw new Error("Station stream unavailable.");
  rememberRadioStream(stationUuid, station.url_resolved);
  return station.url_resolved;
}

async function proxyAudioStream(res, upstreamUrl) {
  const upstream = await fetch(upstreamUrl, {
    headers: {
      "User-Agent": "GeoHubRadio/1.1",
      "Icy-MetaData": "0",
      "Accept": "audio/mpeg,audio/aac,audio/ogg,*/*"
    },
    redirect: "follow"
  });
  if (!upstream.ok || !upstream.body) throw new Error(`Radio stream returned HTTP ${upstream.status}`);
  res.writeHead(200, {
    "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff"
  });
  const { Readable } = require("stream");
  Readable.fromWeb(upstream.body).pipe(res);
}

async function proxyRadioStream(req, res, url) {
  const provider = url.searchParams.get("provider") || "garden";
  try {
    if (provider === "browser") {
      const station = url.searchParams.get("station");
      const upstreamUrl = await resolveRadioBrowserStream(station);
      return await proxyAudioStream(res, upstreamUrl);
    }

    const channelId = url.searchParams.get("channel");
    if (!channelId || !/^[A-Za-z0-9_-]{2,80}$/.test(channelId)) {
      return json(res, 400, { error: "Invalid radio channel." });
    }
    return await proxyAudioStream(res, `https://radio.garden/api/ara/content/listen/${encodeURIComponent(channelId)}/channel.mp3`);
  } catch (error) {
    if (!res.headersSent) return json(res, 502, { error: error instanceof Error ? error.message : String(error) });
    res.destroy(error);
  }
}

async function countryLocation(name) {
  const query = String(name || "").trim();
  if (!query || query.length > 100) return { ready: false, error: "Invalid country." };
  const geo = await geocode(query);
  if (!geo || !Number.isFinite(Number(geo.lat)) || !Number.isFinite(Number(geo.lon))) return { ready: false, error: "Country location unavailable." };
  return { ready: true, lat: Number(geo.lat), lon: Number(geo.lon), country: geo.country || query };
}


async function apiRoute(req, res, pathname) {
  try {
    if (pathname === "/api/status") return json(res, 200, {
      news: Boolean(process.env.NEWS_API_KEY), flights: Boolean(process.env.AVIATIONSTACK_API_KEY), radio: true
    });
    if (pathname === "/api/news") return json(res, 200, await newsQuestion());
    if (pathname === "/api/flights") return json(res, 200, await flightQuestion());
    if (pathname === "/api/radio") return json(res, 200, await radioQuestion());
    if (pathname === "/api/country-location") {
      const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      return json(res, 200, await countryLocation(u.searchParams.get("name")));
    }
    return json(res, 404, { error: "Unknown API route" });
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(ROOT, "." + safePath);
  if (!resolved.startsWith(ROOT)) return json(res, 403, { error: "Forbidden" });
  fs.readFile(resolved, (err, data) => {
    if (err) return json(res, 404, { error: "Not found" });
    res.writeHead(200, { "Content-Type": mime[path.extname(resolved)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  if (url.pathname === "/api/radio-stream") return proxyRadioStream(req, res, url);
  if (url.pathname.startsWith("/api/")) return apiRoute(req, res, url.pathname);
  serveStatic(res, url.pathname);
});

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    const localUrl = `http://localhost:${PORT}`;
    console.log(`GeoHub running at ${localUrl}`);
    console.log(`News API: ${process.env.NEWS_API_KEY ? "configured" : "missing"}`);
    console.log(`Flights API: ${process.env.AVIATIONSTACK_API_KEY ? "configured" : "missing"}`);
    console.log("Radio: Radio Browser primary, Radio Garden fallback");

    if (process.argv.includes("--open") && process.platform === "win32") {
      try {
        const { spawn } = require("child_process");
        const child = spawn("explorer.exe", [localUrl], { detached: true, stdio: "ignore" });
        child.unref();
      } catch (error) {
        console.log(`Open ${localUrl} in your browser.`);
      }
    }
  });
}

module.exports = {
  flightQuestion,
  newsQuestion,
  radioQuestion,
  countryLocation,
};
