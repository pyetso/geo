"use strict";
const { radioQuestion } = require("../server");
const { apiHandler } = require("./_response");
module.exports = apiHandler(radioQuestion);
