"use strict";
const { countryLocation } = require("../lib/game-data");
const { sendJson } = require("../lib/response");
module.exports = async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return sendJson(res, 405, { error: "Method not allowed" }); }
  try {
    const name = Array.isArray(req.query?.name) ? req.query.name[0] : req.query?.name;
    const code = Array.isArray(req.query?.code) ? req.query.code[0] : req.query?.code;
    return sendJson(res, 200, await countryLocation(name, code));
  } catch (error) {
    return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
};
