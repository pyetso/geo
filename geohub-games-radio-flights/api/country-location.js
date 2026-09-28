"use strict";
const { countryLocation } = require("../server");
const { apiHandler } = require("./_response");
module.exports = async function handler(req, res) {
  const name = String(req.query?.name || "");
  return apiHandler(() => countryLocation(name))(req, res);
};
