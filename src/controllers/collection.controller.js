const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function list(request, reply) {
  const storeId = request.query.storeId || undefined;
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 50);
  const where = { storeId };
  const items = await prisma.collection.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { createdAt: 'desc' }
  });
  const total = await prisma.collection.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const coll = await prisma.collection.findUnique({
    where: { id },
    include: { products: { include: { product: true } } }
  });
  if (!coll) return reply.code(404).send({ error: 'collection not found' });
  reply.send(coll);
}

async function getBySlug(request, reply) {
  const { slug } = request.params || {};
  const storeId = request.query.storeId || undefined;
  if (!slug) return reply.code(400).send({ error: 'slug required' });
  const coll = await prisma.collection.findFirst({
    where: { slug, storeId },
    include: { products: { include: { product: true } } }
  });
  if (!coll) return reply.code(404).send({ error: 'collection not found' });
  reply.send(coll);
}

async function products(request, reply) {
  const { id } = request.params || {};
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 20);
  if (!id) return reply.code(400).send({ error: 'id required' });
  const items = await prisma.product.findMany({
    where: { collections: { some: { collectionId: id } }, status: 'ACTIVE' },
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { publishedAt: 'desc' },
    include: { variants: { take: 1 }, media: true }
  });
  const total = await prisma.product.count({ where: { collections: { some: { collectionId: id } }, status: 'ACTIVE' } });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function create(request, reply) {
  const { storeId, name, slug, description, rules, products } = request.body || {};
  if (!storeId || !name || !slug) return reply.code(400).send({ error: 'storeId, name and slug required' });
  const exists = await prisma.collection.findFirst({ where: { storeId, slug } });
  if (exists) return reply.code(409).send({ error: 'slug already exists in store' });
  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.collection.create({
      data: { storeId, name, slug, description: description || null, rules: rules || null }
    });
    if (Array.isArray(products)) {
      let pos = 0;
      for (const pid of products) {
        pos += 1;
        await tx.collectionProduct.create({ data: { collectionId: c.id, productId: pid, position: pos } });
      }
    }
    return c;
  });
  reply.code(201).send(created);
}

async function update(request, reply) {
  const { id } = request.params || {};
  const { name, slug, description, rules, products } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.collection.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'collection not found' });
  if (slug && slug !== existing.slug) {
    const conflict = await prisma.collection.findFirst({ where: { storeId: existing.storeId, slug } });
    if (conflict) return reply.code(409).send({ error: 'slug already exists in store' });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.collection.update({
      where: { id },
      data: { name: name !== undefined ? name : existing.name, slug: slug !== undefined ? slug : existing.slug, description: description !== undefined ? description : existing.description, rules: rules !== undefined ? rules : existing.rules },
      include: { products: true }
    });
    if (Array.isArray(products)) {
      await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
      let pos = 0;
      for (const pid of products) {
        pos += 1;
        await tx.collectionProduct.create({ data: { collectionId: id, productId: pid, position: pos } });
      }
    }
    return c;
  });
  reply.send(updated);
}

async function remove(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const coll = await prisma.collection.findUnique({ where: { id } });
  if (!coll) return reply.code(404).send({ error: 'collection not found' });
  await prisma.$transaction(async (tx) => {
    await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
    await tx.collection.delete({ where: { id } });
  });
  reply.send({ ok: true });
}

async function rebuild(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const coll = await prisma.collection.findUnique({ where: { id } });
  if (!coll) return reply.code(404).send({ error: 'collection not found' });
  const rules = coll.rules || null;
  const toAttach = [];
  if (rules && typeof rules === 'object') {
    if (Array.isArray(rules.productIds)) {
      for (const pid of rules.productIds) toAttach.push(pid);
    }
    if (Array.isArray(rules.categoryIds)) {
      const prods = await prisma.productCategory.findMany({ where: { categoryId: { in: rules.categoryIds } }, select: { productId: true } });
      for (const p of prods) toAttach.push(p.productId);
    }
    if (rules && rules.query && typeof rules.query === 'string') {
      const q = rules.query;
      const prods = await prisma.product.findMany({ where: { OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }], status: 'ACTIVE' }, select: { id: true }, take: rules.limit || 100 });
      for (const p of prods) toAttach.push(p.id);
    }
    if (rules && rules.collectionIds) {
      const cps = await prisma.collectionProduct.findMany({ where: { collectionId: { in: rules.collectionIds } }, select: { productId: true } });
      for (const p of cps) toAttach.push(p.productId);
    }
  }
  const uniqueIds = [...new Set(toAttach)].slice(0, 1000);
  await prisma.$transaction(async (tx) => {
    await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
    let pos = 0;
    for (const pid of uniqueIds) {
      pos += 1;
      await tx.collectionProduct.create({ data: { collectionId: id, productId: pid, position: pos } });
    }
  });
  const updated = await prisma.collection.findUnique({ where: { id }, include: { products: { include: { product: true } } } });
  reply.send(updated);
}

module.exports = {
  list,
  getById,
  getBySlug,
  products,
  create,
  update,
  remove,
  rebuild
};
