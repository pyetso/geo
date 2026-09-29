"use strict";
const { radioQuestion } = require("../lib/game-data");
const { apiHandler } = require("../lib/response");
module.exports = apiHandler(radioQuestion);
