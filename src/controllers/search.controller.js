const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

function normalizeQuery(q) {
  if (!q) return '';
  return String(q).trim();
}

async function products(request, reply) {
  const q = normalizeQuery(request.query.q);
  const storeId = request.query.storeId || undefined;
  const categoryIds = Array.isArray(request.query.category) ? request.query.category : request.query.category ? [request.query.category] : undefined;
  const collectionIds = Array.isArray(request.query.collection) ? request.query.collection : request.query.collection ? [request.query.collection] : undefined;
  const attributeFilters = request.query.attributes ? (() => {
    try { return JSON.parse(request.query.attributes); } catch (e) { return null; }
  })() : null;
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 20);
  const minPrice = request.query.minPrice !== undefined ? parseFloat(request.query.minPrice) : undefined;
  const maxPrice = request.query.maxPrice !== undefined ? parseFloat(request.query.maxPrice) : undefined;
  const where = { storeId: storeId || undefined, status: 'ACTIVE' };
  if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }];
  if (categoryIds) where.categories = { some: { categoryId: { in: categoryIds } } };
  if (collectionIds) where.collections = { some: { collectionId: { in: collectionIds } } };
  if (typeof minPrice === 'number' || typeof maxPrice === 'number') {
    const priceCond = {};
    if (typeof minPrice === 'number') priceCond.gte = minPrice;
    if (typeof maxPrice === 'number') priceCond.lte = maxPrice;
    where.variants = { some: { price: priceCond } };
  }
  if (attributeFilters && typeof attributeFilters === 'object') {
    const attrConstraints = [];
    for (const attrId in attributeFilters) {
      const values = Array.isArray(attributeFilters[attrId]) ? attributeFilters[attrId] : [attributeFilters[attrId]];
      attrConstraints.push({ variants: { some: { attributes: { some: { attributeId: attrId, valueId: { in: values } } } } } });
    }
    if (attrConstraints.length) where.AND = attrConstraints;
  }
  const items = await prisma.product.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { publishedAt: 'desc' },
    include: { variants: { take: 1 }, media: true }
  });
  const total = await prisma.product.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function suggest(request, reply) {
  const q = normalizeQuery(request.query.q);
  const storeId = request.query.storeId || undefined;
  if (!q) return reply.send({ suggestions: [] });
  const products = await prisma.product.findMany({
    where: { storeId: storeId || undefined, status: 'ACTIVE', title: { contains: q, mode: 'insensitive' } },
    take: 10,
    select: { id: true, title: true, slug: true, media: true }
  });
  const titles = products.map(p => ({ id: p.id, title: p.title, slug: p.slug, image: (p.media && p.media[0] && p.media[0].url) || null }));
  const attrs = await prisma.attributeValue.findMany({
    where: { value: { contains: q, mode: 'insensitive' } },
    take: 10,
    select: { id: true, value: true, attributeId: true }
  });
  const attrSugs = attrs.map(a => ({ id: a.id, value: a.value, attributeId: a.attributeId }));
  reply.send({ suggestions: { products: titles, attributeValues: attrSugs } });
}

async function facets(request, reply) {
  const q = normalizeQuery(request.query.q);
  const storeId = request.query.storeId || undefined;
  const where = { storeId: storeId || undefined, status: 'ACTIVE' };
  if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }];
  const categoryCountsPromise = prisma.productCategory.groupBy({
    by: ['categoryId'],
    where: { product: { storeId: where.storeId, status: 'ACTIVE', OR: where.OR ? where.OR : undefined } },
    _count: { categoryId: true },
    orderBy: { _count: { categoryId: 'desc' } },
    take: 50
  });
  const attrValueCountsPromise = prisma.variantAttribute.groupBy({
    by: ['valueId', 'attributeId'],
    where: { variant: { product: { storeId: where.storeId, status: 'ACTIVE', OR: where.OR ? where.OR : undefined } } },
    _count: { valueId: true },
    orderBy: { _count: { valueId: 'desc' } },
    take: 200
  });
  const priceRangePromise = prisma.productVariant.aggregate({
    _min: { price: true },
    _max: { price: true },
    where: { product: { storeId: where.storeId, status: 'ACTIVE', OR: where.OR ? where.OR : undefined } }
  });
  const [categoryCounts, attrCounts, priceRange] = await Promise.all([categoryCountsPromise, attrValueCountsPromise, priceRangePromise]);
  const categories = [];
  if (categoryCounts.length) {
    const ids = categoryCounts.map(c => c.categoryId);
    const cats = await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } });
    for (const c of categoryCounts) {
      const meta = cats.find(x => x.id === c.categoryId);
      categories.push({ id: c.categoryId, name: meta ? meta.name : null, slug: meta ? meta.slug : null, count: c._count.categoryId });
    }
  }
  const attributes = [];
  if (attrCounts.length) {
    const valueIds = [...new Set(attrCounts.map(a => a.valueId))];
    const vals = await prisma.attributeValue.findMany({ where: { id: { in: valueIds } }, select: { id: true, value: true, attributeId: true } });
    for (const a of attrCounts) {
      const meta = vals.find(v => v.id === a.valueId);
      attributes.push({ attributeId: a.attributeId, valueId: a.valueId, value: meta ? meta.value : null, count: a._count.valueId });
    }
  }
  const price = { min: priceRange._min.price || 0, max: priceRange._max.price || 0 };
  reply.send({ facets: { categories, attributes, price } });
}

module.exports = {
  products,
  suggest,
  facets
};
