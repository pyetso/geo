"use strict";

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function apiHandler(work) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { error: "Method not allowed" });
    }
    try {
      return sendJson(res, 200, await work());
    } catch (error) {
      return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}

module.exports = { apiHandler, sendJson };
