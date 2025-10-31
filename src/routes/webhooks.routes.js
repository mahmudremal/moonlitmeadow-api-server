const webhooksController = require('../controllers/webhooks.controller');

async function routes (fastify, opts) {
  fastify.post('/payment/:provider', webhooksController.payment);
  fastify.post('/shipping/:provider', webhooksController.shipping);
  fastify.post('/cms/:provider', webhooksController.cms);
}

module.exports = routes;
