"use strict";
const { sendJson } = require("../lib/response");
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  return sendJson(res, 200, {
    news: Boolean(process.env.NEWS_API_KEY),
    flights: Boolean(process.env.AVIATIONSTACK_API_KEY),
    radio: true
  });
};
