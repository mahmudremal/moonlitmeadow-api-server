
const authRoutes = require('./auth.routes');
const productRoutes = require('./product.routes');
const categoryRoutes = require('./category.routes');
const collectionRoutes = require('./collection.routes');
const variantRoutes = require('./variant.routes');
const attributeRoutes = require('./attribute.routes');
const mediaRoutes = require('./media.routes');
const inventoryRoutes = require('./inventory.routes');
const warehouseRoutes = require('./warehouse.routes');
const cartRoutes = require('./cart.routes');
const orderRoutes = require('./order.routes');
const paymentRoutes = require('./payment.routes');
const campaignRoutes = require('./campaign.routes');
const couponRoutes = require('./coupon.routes');
const searchRoutes = require('./search.routes');
const userRoutes = require('./user.routes');
const reviewRoutes = require('./review.routes');
const fulfillmentRoutes = require('./fulfillment.routes');
const webhooksRoutes = require('./webhooks.routes');

async function routes (fastify, opts) {
  fastify.register(authRoutes, { prefix: '/auth' });
  fastify.register(userRoutes, { prefix: '/users' });
  fastify.register(productRoutes, { prefix: '/products' });
  fastify.register(categoryRoutes, { prefix: '/categories' });
  fastify.register(collectionRoutes, { prefix: '/collections' });
  fastify.register(variantRoutes, { prefix: '/variants' });
  fastify.register(attributeRoutes, { prefix: '/attributes' });
  fastify.register(mediaRoutes, { prefix: '/media' });
  fastify.register(inventoryRoutes, { prefix: '/inventory' });
  fastify.register(warehouseRoutes, { prefix: '/warehouses' });
  fastify.register(cartRoutes, { prefix: '/carts' });
  fastify.register(orderRoutes, { prefix: '/orders' });
  fastify.register(paymentRoutes, { prefix: '/payments' });
  fastify.register(campaignRoutes, { prefix: '/campaigns' });
  fastify.register(couponRoutes, { prefix: '/coupons' });
  fastify.register(searchRoutes, { prefix: '/search' });
  fastify.register(reviewRoutes, { prefix: '/reviews' });
  fastify.register(fulfillmentRoutes, { prefix: '/fulfillments' });
  fastify.register(webhooksRoutes, { prefix: '/webhooks' });
  fastify.get('/health', async () => ({ ok: true, now: new Date() }));
  fastify.get('/', async () => ({ status: true }));
}

module.exports = routes;
