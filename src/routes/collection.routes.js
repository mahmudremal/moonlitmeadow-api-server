const collectionController = require('../controllers/collection.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', collectionController.list);
  fastify.get('/:id', collectionController.getById);
  fastify.get('/slug/:slug', collectionController.getBySlug);
  fastify.get('/:id/products', collectionController.products);
  fastify.post('/', { preHandler: auth }, collectionController.create);
  fastify.put('/:id', { preHandler: auth }, collectionController.update);
  fastify.delete('/:id', { preHandler: auth }, collectionController.remove);
  fastify.post('/:id/rebuild', { preHandler: auth }, collectionController.rebuild);
}

module.exports = routes;
