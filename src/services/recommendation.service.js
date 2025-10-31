const prisma = require('../db/prismaClient');

/*
  Initial simple recommendation engine:
  - Count co-occurrence of product views in interactions.
  - For a product P, find other products most frequently viewed by the same users who viewed P.
  - This is simplistic but fast to start; replace with offline model training or real-time vector search later.
*/

async function recommendForProduct(productId, limit = 6) {
  // 1. find userIds who viewed this product recently
  const interactions = await prisma.interaction.findMany({
    where: { productId, type: 'VIEW' },
    select: { userId: true },
    distinct: ['userId'],
    take: 1000
  });

  const userIds = interactions.map(i => i.userId).filter(Boolean);
  if (userIds.length === 0) return [];

  // 2. find other products viewed by these users and count occurrences
  const coViews = await prisma.interaction.groupBy({
    by: ['productId'],
    where: {
      userId: { in: userIds },
      productId: { not: productId },
      type: 'VIEW'
    },
    _count: { productId: true },
    orderBy: { _count: { productId: 'desc' } },
    take: limit
  });

  const productIds = coViews.map(c => c.productId);
  if (productIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { category: true }
  });

  // preserve order by coViews
  const productsById = products.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
  return productIds.map(id => productsById[id]).filter(Boolean);
}

module.exports = { recommendForProduct };
