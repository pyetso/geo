"use strict";
const { windowQuestion } = require("../lib/game-data");
const { apiHandler } = require("../lib/response");
module.exports = apiHandler(windowQuestion);
