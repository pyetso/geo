"use strict";
const { newsQuestion } = require("../server");
const { apiHandler } = require("./_response");
module.exports = apiHandler(newsQuestion);
