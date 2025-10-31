const campaignController = require('../controllers/campaign.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.get('/', campaignController.list);
  fastify.get('/:id', campaignController.getById);
  fastify.post('/', { preHandler: auth }, campaignController.create);
  fastify.put('/:id', { preHandler: auth }, campaignController.update);
  fastify.post('/:id/activate', { preHandler: auth }, campaignController.activate);
  fastify.post('/:id/deactivate', { preHandler: auth }, campaignController.deactivate);
  fastify.delete('/:id', { preHandler: auth }, campaignController.remove);
}

module.exports = routes;
