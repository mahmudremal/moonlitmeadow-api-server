const orderController = require('../controllers/order.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', { preHandler: auth }, orderController.list);
  fastify.get('/:id', { preHandler: auth }, orderController.getById);
  fastify.get('/number/:orderNumber', { preHandler: auth }, orderController.getByNumber);
  fastify.post('/', { preHandler: auth }, orderController.create);
  fastify.post('/:id/cancel', { preHandler: auth }, orderController.cancel);
  fastify.post('/:id/confirm', { preHandler: auth }, orderController.confirm);
  fastify.post('/:id/fulfill', { preHandler: auth }, orderController.createFulfillment);
  fastify.post('/:id/refund', { preHandler: auth }, orderController.refund);
}

module.exports = routes;
