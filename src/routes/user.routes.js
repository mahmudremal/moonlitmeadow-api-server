const userController = require('../controllers/user.controller');
const auth = require('../middlewares/auth');

async function routes (fastify, opts) {
  fastify.post('/', userController.create);
  fastify.get('/me', { preHandler: auth }, userController.me);
  fastify.put('/me', { preHandler: auth }, userController.updateMe);
  fastify.get('/:id', { preHandler: auth }, userController.getById);
  fastify.put('/:id', { preHandler: auth }, userController.update);
  fastify.delete('/:id', { preHandler: auth }, userController.remove);
  fastify.post('/:id/roles', { preHandler: auth }, userController.assignRole);
  fastify.delete('/:id/roles/:roleId', { preHandler: auth }, userController.revokeRole);
}

module.exports = routes;
