"use strict";

const { Readable } = require("stream");

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
      const response = await fetch(`${host}/json/stations/byuuid/${encodeURIComponent(stationUuid)}`, {
        headers: { "User-Agent": "GeoHubRadio/1.1" }
      });
      if (!response.ok) throw new Error(`Station lookup returned HTTP ${response.status}`);
      const rows = await response.json();
      const station = Array.isArray(rows) ? (rows.find(s => s?.stationuuid === stationUuid) || rows[0]) : null;
      if (station?.url_resolved && /^(https?:)/i.test(station.url_resolved)) return station.url_resolved;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("Station stream unavailable.");
}

async function pipeStream(res, upstreamUrl) {
  const upstream = await fetch(upstreamUrl, {
    headers: {
      "User-Agent": "GeoHubRadio/1.1",
      "Icy-MetaData": "0",
      "Accept": "audio/mpeg,audio/aac,audio/ogg,*/*"
    },
    redirect: "follow"
  });
  if (!upstream.ok || !upstream.body) throw new Error(`Radio stream returned HTTP ${upstream.status}`);
  res.statusCode = 200;
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Content-Type-Options", "nosniff");
  Readable.fromWeb(upstream.body).pipe(res);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  try {
    const provider = String(req.query?.provider || "garden");
    if (provider === "browser") {
      const upstreamUrl = await resolveBrowserStation(String(req.query?.station || ""));
      return await pipeStream(res, upstreamUrl);
    }

    const channel = String(req.query?.channel || "");
    if (!channel || !/^[A-Za-z0-9_-]{2,80}$/.test(channel)) throw new Error("Invalid radio channel.");
    return await pipeStream(res, `https://radio.garden/api/ara/content/listen/${encodeURIComponent(channel)}/channel.mp3`);
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    res.destroy(error);
  }
};
