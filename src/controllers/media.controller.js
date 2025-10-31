const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function list(request, reply) {
  const storeId = request.query.storeId || undefined;
  const productId = request.query.productId || undefined;
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 50);
  const where = {};
  if (storeId) where.storeId = storeId;
  if (productId) where.productId = productId;
  const items = await prisma.media.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { position: 'asc' }
  });
  const total = await prisma.media.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const item = await prisma.media.findUnique({ where: { id } });
  if (!item) return reply.code(404).send({ error: 'media not found' });
  reply.send(item);
}

async function upload(request, reply) {
  const { storeId, productId, url, type, altText, position, meta } = request.body || {};
  if (!storeId || !url) return reply.code(400).send({ error: 'storeId and url required' });
  const created = await prisma.media.create({
    data: {
      storeId,
      productId: productId || null,
      url,
      type: type || 'IMAGE',
      altText: altText || null,
      position: position || 0,
      meta: meta || null
    }
  });
  reply.code(201).send(created);
}

async function update(request, reply) {
  const { id } = request.params || {};
  const { url, type, altText, position, meta } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.media.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'media not found' });
  const data = {};
  if (url !== undefined) data.url = url;
  if (type !== undefined) data.type = type;
  if (altText !== undefined) data.altText = altText;
  if (position !== undefined) data.position = position;
  if (meta !== undefined) data.meta = meta;
  const updated = await prisma.media.update({ where: { id }, data });
  reply.send(updated);
}

async function remove(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.media.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'media not found' });
  await prisma.media.delete({ where: { id } });
  reply.send({ ok: true });
}

module.exports = {
  list,
  getById,
  upload,
  update,
  remove
};
