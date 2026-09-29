"use strict";
const { countryLocation } = require("../lib/game-data");
const { sendJson } = require("../lib/response");
module.exports = async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return sendJson(res, 405, { error: "Method not allowed" }); }
  try {
    const value = Array.isArray(req.query?.name) ? req.query.name[0] : req.query?.name;
    return sendJson(res, 200, await countryLocation(value));
  } catch (error) {
    return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
};
