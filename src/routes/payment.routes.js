const paymentController = require('../controllers/payment.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.post('/providers/:provider/charge', { preHandler: auth }, paymentController.charge);
  fastify.post('/providers/:provider/webhook', paymentController.webhook);
  fastify.get('/providers', paymentController.listProviders);
}

module.exports = routes;
