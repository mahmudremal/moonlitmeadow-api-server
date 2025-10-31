const cartController = require('../controllers/cart.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/:id', { preHandler: auth }, cartController.getById);
  fastify.post('/', cartController.create);
  fastify.post('/:id/items', cartController.addItem);
  fastify.put('/:id/items/:itemId', cartController.updateItem);
  fastify.delete('/:id/items/:itemId', cartController.removeItem);
  fastify.post('/:id/merge', cartController.merge);
  fastify.post('/:id/checkout', { preHandler: auth }, cartController.checkout);
}

module.exports = routes;
