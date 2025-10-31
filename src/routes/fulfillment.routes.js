const fulfillmentController = require('../controllers/fulfillment.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', { preHandler: auth }, fulfillmentController.list);
  fastify.get('/:id', { preHandler: auth }, fulfillmentController.getById);
  fastify.post('/:id/track', fulfillmentController.track);
  fastify.post('/:id/ship', { preHandler: auth }, fulfillmentController.ship);
  fastify.post('/:id/return', { preHandler: auth }, fulfillmentController.return);
}

module.exports = routes;
