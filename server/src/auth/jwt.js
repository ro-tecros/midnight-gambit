'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (err) {
    return null;
  }
}

module.exports = { signToken, verifyToken };
