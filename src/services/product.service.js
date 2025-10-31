const prisma = require('../db/prismaClient');
const redis = require('../lib/redisClient');
const recommendationService = require('./recommendation.service');

const CACHE_TTL = 60; // seconds (example)

async function list({ page = 1, perPage = 20, q = '' }) {
  const offset = (page - 1) * perPage;
  const cacheKey = `products:page:${page}:per:${perPage}:q:${q}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const where = q ? {
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } }
    ]
  } : {};

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true },
      skip: offset,
      take: perPage,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.product.count({ where })
  ]);

  const res = { items, meta: { page, perPage, total } };
  await redis.set(cacheKey, JSON.stringify(res), 'EX', CACHE_TTL);
  return res;
}

async function getById(id) {
  const cacheKey = `product:${id}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const product = await prisma.product.findUnique({ where: { id }, include: { category: true } });
  if (product) await redis.set(cacheKey, JSON.stringify(product), 'EX', 300);
  return product;
}

async function create(payload) {
  // Basic validation omitted for brevity
  const product = await prisma.product.create({
    data: {
      title: payload.title,
      description: payload.description || '',
      price: payload.price || 0,
      sku: payload.sku,
      category: { connect: { id: payload.categoryId } },
      imageUrl: payload.imageUrl || null
    }
  });
  // evict relevant caches
  await redis.del('products:page:1:per:20:q:');
  return product;
}

async function recommendations(productId) {
  // fallback local recommendations, decorated by cache
  const cacheKey = `recs:product:${productId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const recs = await recommendationService.recommendForProduct(productId);
  await redis.set(cacheKey, JSON.stringify(recs), 'EX', 120);
  return recs;
}

module.exports = { list, getById, create, recommendations };
