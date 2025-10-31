const warehouseController = require('../controllers/warehouse.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', warehouseController.list);
  fastify.get('/:id', warehouseController.getById);
  fastify.post('/', { preHandler: auth }, warehouseController.create);
  fastify.put('/:id', { preHandler: auth }, warehouseController.update);
  fastify.delete('/:id', { preHandler: auth }, warehouseController.remove);
}

module.exports = routes;
