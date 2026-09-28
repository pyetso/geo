"use strict";
const { flightQuestion } = require("../server");
const { apiHandler } = require("./_response");
module.exports = apiHandler(flightQuestion);
