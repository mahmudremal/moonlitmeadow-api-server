const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function forProduct(request, reply) {
  const { productId } = request.params || {};
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 20);
  if (!productId) return reply.code(400).send({ error: 'productId required' });
  const where = { productId };
  const items = await prisma.review.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { createdAt: 'desc' },
    include: { product: true, user: { select: { id: true, email: true, name: true } } }
  });
  const total = await prisma.review.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function create(request, reply) {
  const userId = request.user && request.user.sub;
  const { productId } = request.params || {};
  const { rating, title, body } = request.body || {};
  if (!productId) return reply.code(400).send({ error: 'productId required' });
  if (!userId) return reply.code(401).send({ error: 'authentication required' });
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return reply.code(404).send({ error: 'product not found' });
  const r = await prisma.review.create({
    data: {
      productId,
      userId,
      rating: Math.max(1, Math.min(5, parseInt(rating, 10) || 0)),
      title: title || null,
      body: body || null,
      moderated: false
    }
  });
  reply.code(201).send(r);
}

async function update(request, reply) {
  const userId = request.user && request.user.sub;
  const { id } = request.params || {};
  const { rating, title, body } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'review not found' });
  if (!userId || existing.userId !== userId) return reply.code(403).send({ error: 'forbidden' });
  const data = {};
  if (rating !== undefined) data.rating = Math.max(1, Math.min(5, parseInt(rating, 10) || 0));
  if (title !== undefined) data.title = title;
  if (body !== undefined) data.body = body;
  data.moderated = false;
  const updated = await prisma.review.update({ where: { id }, data });
  reply.send(updated);
}

async function moderate(request, reply) {
  const { id } = request.params || {};
  const { moderated, action } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'review not found' });
  const data = {};
  if (typeof moderated === 'boolean') data.moderated = moderated;
  if (action === 'approve') data.moderated = true;
  if (action === 'reject') data.moderated = true;
  const updated = await prisma.review.update({ where: { id }, data });
  reply.send(updated);
}

async function remove(request, reply) {
  const userId = request.user && request.user.sub;
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'review not found' });
  if (existing.userId && (!userId || existing.userId !== userId)) return reply.code(403).send({ error: 'forbidden' });
  await prisma.review.delete({ where: { id } });
  reply.send({ ok: true });
}

module.exports = {
  forProduct,
  create,
  update,
  moderate,
  remove
};
