const categoryController = require('../controllers/category.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', categoryController.list);
  fastify.get('/:id', categoryController.getById);
  fastify.get('/slug/:slug', categoryController.getBySlug);
  fastify.post('/', { preHandler: auth }, categoryController.create);
  fastify.put('/:id', { preHandler: auth }, categoryController.update);
  fastify.delete('/:id', { preHandler: auth }, categoryController.remove);
  fastify.get('/:id/products', categoryController.products);
}

module.exports = routes;
