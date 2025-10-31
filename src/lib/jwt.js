const config = require('../config');

function sign(user) {
  // minimal payload; extend as needed
  const payload = { sub: user.id, email: user.email };
  return { token: require('fastify-jwt').sign ? require('fastify-jwt').sign(payload) : null };
}

module.exports = {
  // fastify-jwt plugin used elsewhere; this file can expose helpers
};
