"use strict";
const { newsQuestion } = require("../lib/game-data");
const { apiHandler } = require("../lib/response");
module.exports = apiHandler(newsQuestion);
