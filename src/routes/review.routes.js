const reviewController = require('../controllers/review.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/product/:productId', reviewController.forProduct);
  fastify.post('/product/:productId', { preHandler: auth }, reviewController.create);
  fastify.put('/:id', { preHandler: auth }, reviewController.update);
  fastify.post('/:id/moderate', { preHandler: auth }, reviewController.moderate);
  fastify.delete('/:id', { preHandler: auth }, reviewController.remove);
}

module.exports = routes;
