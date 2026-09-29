"use strict";
const { flightQuestion } = require("../lib/game-data");
const { apiHandler } = require("../lib/response");
module.exports = apiHandler(flightQuestion);
