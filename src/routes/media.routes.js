const mediaController = require('../controllers/media.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', mediaController.list);
  fastify.get('/:id', mediaController.getById);
  fastify.post('/', { preHandler: auth }, mediaController.upload);
  fastify.put('/:id', { preHandler: auth }, mediaController.update);
  fastify.delete('/:id', { preHandler: auth }, mediaController.remove);
}

module.exports = routes;
