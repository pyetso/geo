"use strict";
const RADIO_BROWSER_HOSTS = [
  "https://all.api.radio-browser.info",
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info"
];
async function resolveBrowserStation(stationUuid) {
  if (!stationUuid || !/^[A-Za-z0-9-]{6,80}$/.test(stationUuid)) throw new Error("Invalid radio station.");
  let lastError;
  for (const host of RADIO_BROWSER_HOSTS) {
    try {
      const response = await fetch(`${host}/json/stations/byuuid/${encodeURIComponent(stationUuid)}`, { headers: { "User-Agent": "GeoHubRadio/1.2" } });
      if (!response.ok) throw new Error(`Station lookup returned HTTP ${response.status}`);
      const rows = await response.json();
      const station = Array.isArray(rows) ? (rows.find(s => s?.stationuuid === stationUuid) || rows[0]) : null;
      if (station?.url_resolved && /^(https?:)/i.test(station.url_resolved)) return station.url_resolved;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("Station stream unavailable.");
}
module.exports = async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); res.statusCode = 405; return res.end("Method not allowed"); }
  try {
    const provider = String(req.query?.provider || "garden");
    let target;
    if (provider === "browser") target = await resolveBrowserStation(String(req.query?.station || ""));
    else {
      const channel = String(req.query?.channel || "");
      if (!channel || !/^[A-Za-z0-9_-]{2,80}$/.test(channel)) throw new Error("Invalid radio channel.");
      target = `https://radio.garden/api/ara/content/listen/${encodeURIComponent(channel)}/channel.mp3`;
    }
    res.statusCode = 307;
    res.setHeader("Location", target);
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
};
