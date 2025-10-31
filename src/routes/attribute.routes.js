const attributeController = require('../controllers/attribute.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', attributeController.list);
  fastify.get('/:id', attributeController.getById);
  fastify.post('/', { preHandler: auth }, attributeController.create);
  fastify.put('/:id', { preHandler: auth }, attributeController.update);
  fastify.delete('/:id', { preHandler: auth }, attributeController.remove);
  fastify.post('/:id/values', { preHandler: auth }, attributeController.addValue);
  fastify.put('/:id/values/:valueId', { preHandler: auth }, attributeController.updateValue);
  fastify.delete('/:id/values/:valueId', { preHandler: auth }, attributeController.removeValue);
}

module.exports = routes;
