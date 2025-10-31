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
  const items = await prisma.attribute.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { createdAt: 'desc' },
    include: { values: true }
  });
  const total = await prisma.attribute.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const attr = await prisma.attribute.findUnique({
    where: { id },
    include: { values: { orderBy: { sortOrder: 'asc' } } }
  });
  if (!attr) return reply.code(404).send({ error: 'attribute not found' });
  reply.send(attr);
}

async function create(request, reply) {
  const { storeId, name, slug, type, values } = request.body || {};
  if (!storeId || !name || !slug) return reply.code(400).send({ error: 'storeId, name and slug required' });
  const existing = await prisma.attribute.findFirst({ where: { storeId, slug } });
  if (existing) return reply.code(409).send({ error: 'slug already exists in store' });
  const created = await prisma.$transaction(async (tx) => {
    const a = await tx.attribute.create({
      data: { storeId, name, slug, type: type || 'TEXT' }
    });
    if (Array.isArray(values)) {
      let pos = 0;
      for (const v of values) {
        pos += 1;
        await tx.attributeValue.create({ data: { attributeId: a.id, value: v.value, sortOrder: v.sortOrder || pos, meta: v.meta || null } });
      }
    }
    return tx.attribute.findUnique({ where: { id: a.id }, include: { values: true } });
  });
  reply.code(201).send(created);
}

async function update(request, reply) {
  const { id } = request.params || {};
  const { name, slug, type } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.attribute.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'attribute not found' });
  if (slug && slug !== existing.slug) {
    const conflict = await prisma.attribute.findFirst({ where: { storeId: existing.storeId, slug } });
    if (conflict) return reply.code(409).send({ error: 'slug already exists in store' });
  }
  const data = {};
  if (name !== undefined) data.name = name;
  if (slug !== undefined) data.slug = slug;
  if (type !== undefined) data.type = type;
  const updated = await prisma.attribute.update({ where: { id }, data, include: { values: true } });
  reply.send(updated);
}

async function remove(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const attr = await prisma.attribute.findUnique({ where: { id } });
  if (!attr) return reply.code(404).send({ error: 'attribute not found' });
  await prisma.$transaction(async (tx) => {
    await tx.attributeValue.deleteMany({ where: { attributeId: id } });
    await tx.attribute.delete({ where: { id } });
  });
  reply.send({ ok: true });
}

async function addValue(request, reply) {
  const { id } = request.params || {};
  const { value, sortOrder, meta } = request.body || {};
  if (!id || value === undefined) return reply.code(400).send({ error: 'attribute id and value required' });
  const attr = await prisma.attribute.findUnique({ where: { id } });
  if (!attr) return reply.code(404).send({ error: 'attribute not found' });
  const exists = await prisma.attributeValue.findFirst({ where: { attributeId: id, value } });
  if (exists) return reply.code(409).send({ error: 'value already exists for attribute' });
  const created = await prisma.attributeValue.create({ data: { attributeId: id, value, sortOrder: sortOrder || 0, meta: meta || null } });
  reply.code(201).send(created);
}

async function updateValue(request, reply) {
  const { id, valueId } = request.params || {};
  const { value, sortOrder, meta } = request.body || {};
  if (!id || !valueId) return reply.code(400).send({ error: 'attribute id and valueId required' });
  const val = await prisma.attributeValue.findUnique({ where: { id: valueId } });
  if (!val || val.attributeId !== id) return reply.code(404).send({ error: 'attribute value not found' });
  if (value !== undefined && value !== val.value) {
    const conflict = await prisma.attributeValue.findFirst({ where: { attributeId: id, value } });
    if (conflict) return reply.code(409).send({ error: 'value already exists for attribute' });
  }
  const data = {};
  if (value !== undefined) data.value = value;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;
  if (meta !== undefined) data.meta = meta;
  const updated = await prisma.attributeValue.update({ where: { id: valueId }, data });
  reply.send(updated);
}

async function removeValue(request, reply) {
  const { id, valueId } = request.params || {};
  if (!id || !valueId) return reply.code(400).send({ error: 'attribute id and valueId required' });
  const val = await prisma.attributeValue.findUnique({ where: { id: valueId } });
  if (!val || val.attributeId !== id) return reply.code(404).send({ error: 'attribute value not found' });
  await prisma.attributeValue.delete({ where: { id: valueId } });
  reply.send({ ok: true });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  addValue,
  updateValue,
  removeValue
};
