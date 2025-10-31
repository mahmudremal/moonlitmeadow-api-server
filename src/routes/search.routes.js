const searchController = require('../controllers/search.controller');

async function routes (fastify, opts) {
  fastify.get('/products', searchController.products);
  fastify.get('/suggest', searchController.suggest);
  fastify.get('/facets', searchController.facets);
}

module.exports = routes;
