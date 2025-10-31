const inventoryController = require('../controllers/inventory.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/variant/:variantId', inventoryController.byVariant);
  fastify.get('/variant/:variantId/warehouses', inventoryController.byVariantDetailed);
  fastify.post('/reserve', { preHandler: auth }, inventoryController.reserve);
  fastify.post('/release', { preHandler: auth }, inventoryController.release);
  fastify.post('/adjust', { preHandler: auth }, inventoryController.adjust);
  fastify.get('/low-stock', { preHandler: auth }, inventoryController.lowStock);
}

module.exports = routes;
