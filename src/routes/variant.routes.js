const variantController = require('../controllers/variant.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', variantController.list);
  fastify.get('/:id', variantController.getById);
  fastify.get('/sku/:sku', variantController.getBySku);
  fastify.post('/', { preHandler: auth }, variantController.create);
  fastify.put('/:id', { preHandler: auth }, variantController.update);
  fastify.delete('/:id', { preHandler: auth }, variantController.remove);
  fastify.post('/:id/prices', { preHandler: auth }, variantController.setPrices);
  fastify.get('/:id/inventory', variantController.inventory);
}

module.exports = routes;
