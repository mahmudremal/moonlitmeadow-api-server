const couponController = require('../controllers/coupon.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', couponController.list);
  fastify.get('/:code', couponController.getByCode);
  fastify.post('/', { preHandler: auth }, couponController.create);
  fastify.put('/:id', { preHandler: auth }, couponController.update);
  fastify.post('/validate', couponController.validate);
}

module.exports = routes;
