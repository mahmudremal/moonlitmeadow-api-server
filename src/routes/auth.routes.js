const authController = require('../controllers/auth.controller');

async function routes (fastify, opts) {
  fastify.post('/login', authController.login);
  fastify.post('/register', authController.register);
}

module.exports = routes;
