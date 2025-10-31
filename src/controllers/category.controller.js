const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function list(request, reply) {
  const storeId = request.query.storeId || null;
  const parentId = request.query.parentId || undefined;
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 50);
  const where = { storeId: storeId || undefined, parentId };
  const items = await prisma.category.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { position: 'asc' },
    include: { children: true }
  });
  const total = await prisma.category.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const category = await prisma.category.findUnique({
    where: { id },
    include: { parent: true, children: true }
  });
  if (!category) return reply.code(404).send({ error: 'category not found' });
  reply.send(category);
}

async function getBySlug(request, reply) {
  const { slug } = request.params || {};
  const storeId = request.query.storeId || null;
  if (!slug) return reply.code(400).send({ error: 'slug required' });
  const category = await prisma.category.findFirst({
    where: { slug, storeId: storeId || undefined },
    include: { parent: true, children: true }
  });
  if (!category) return reply.code(404).send({ error: 'category not found' });
  reply.send(category);
}

async function create(request, reply) {
  const { storeId, name, slug, parentId, position } = request.body || {};
  if (!storeId || !name || !slug) return reply.code(400).send({ error: 'storeId, name and slug required' });
  const exists = await prisma.category.findFirst({ where: { storeId, slug } });
  if (exists) return reply.code(409).send({ error: 'slug already exists in store' });
  const created = await prisma.category.create({
    data: {
      storeId,
      name,
      slug,
      parentId: parentId || null,
      position: position || 0
    }
  });
  reply.code(201).send(created);
}

async function update(request, reply) {
  const { id } = request.params || {};
  const { name, slug, parentId, position } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'category not found' });
  if (slug && slug !== existing.slug) {
    const conflict = await prisma.category.findFirst({ where: { storeId: existing.storeId, slug } });
    if (conflict) return reply.code(409).send({ error: 'slug already exists in store' });
  }
  const data = {};
  if (name !== undefined) data.name = name;
  if (slug !== undefined) data.slug = slug;
  if (parentId !== undefined) data.parentId = parentId;
  if (position !== undefined) data.position = position;
  const updated = await prisma.category.update({ where: { id }, data });
  reply.send(updated);
}

async function remove(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return reply.code(404).send({ error: 'category not found' });
  await prisma.$transaction(async (tx) => {
    await tx.productCategory.deleteMany({ where: { categoryId: id } });
    await tx.category.updateMany({ where: { parentId: id }, data: { parentId: null } });
    await tx.category.delete({ where: { id } });
  });
  reply.send({ ok: true });
}

async function products(request, reply) {
  const { id } = request.params || {};
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 20);
  if (!id) return reply.code(400).send({ error: 'id required' });
  const where = { categories: { some: { categoryId: id } }, status: 'ACTIVE' };
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

module.exports = {
  list,
  getById,
  getBySlug,
  create,
  update,
  remove,
  products
};
