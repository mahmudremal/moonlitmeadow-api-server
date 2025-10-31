const productController = require('../controllers/product.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', productController.list);
  fastify.get('/search', productController.search);
  fastify.get('/slug/:slug', productController.getBySlug);
  fastify.get('/:id', productController.getById);
  fastify.get('/:id/variants', productController.listVariants);
  fastify.get('/:id/related', productController.related);
  fastify.get('/:id/recommendations', productController.recommendations);
  fastify.post('/', { preHandler: auth }, productController.create);
  fastify.put('/:id', { preHandler: auth }, productController.update);
  fastify.delete('/:id', { preHandler: auth }, productController.remove);
  fastify.post('/:id/publish', { preHandler: auth }, productController.publish);
  fastify.post('/:id/unpublish', { preHandler: auth }, productController.unpublish);
}

module.exports = routes;
