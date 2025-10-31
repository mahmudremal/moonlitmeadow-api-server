const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function list(request, reply) {
  const storeId = request.query.storeId || undefined;
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 20);
  const where = storeId ? { product: { storeId } } : {};
  const variants = await prisma.productVariant.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { createdAt: 'desc' },
    include: { product: true, attributes: { include: { attribute: true, value: true } }, inventory: { include: { warehouse: true } }, media: true }
  });
  const total = await prisma.productVariant.count({ where });
  reply.send({ data: variants, meta: { page, perPage, total } });
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const variant = await prisma.productVariant.findUnique({
    where: { id },
    include: { product: true, attributes: { include: { attribute: true, value: true } }, inventory: { include: { warehouse: true } }, media: true }
  });
  if (!variant) return reply.code(404).send({ error: 'variant not found' });
  reply.send(variant);
}

async function getBySku(request, reply) {
  const { sku } = request.params || {};
  if (!sku) return reply.code(400).send({ error: 'sku required' });
  const variant = await prisma.productVariant.findUnique({
    where: { sku },
    include: { product: true, attributes: { include: { attribute: true, value: true } }, inventory: { include: { warehouse: true } }, media: true }
  });
  if (!variant) return reply.code(404).send({ error: 'variant not found' });
  reply.send(variant);
}

async function create(request, reply) {
  const body = request.body || {};
  const { productId, sku, title, barcode, price, compareAt, weightKg, dimensions, attributes, media, customData } = body;
  if (!productId || !sku) return reply.code(400).send({ error: 'productId and sku required' });
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return reply.code(404).send({ error: 'product not found' });
  const exists = await prisma.productVariant.findUnique({ where: { sku } });
  if (exists) return reply.code(409).send({ error: 'sku already exists' });
  const created = await prisma.$transaction(async (tx) => {
    const v = await tx.productVariant.create({
      data: {
        productId,
        sku,
        title: title || null,
        barcode: barcode || null,
        price: price || 0,
        compareAt: compareAt || null,
        weightKg: weightKg || null,
        dimensions: dimensions || null,
        customData: customData || null
      }
    });
    if (Array.isArray(attributes)) {
      for (const a of attributes) {
        await tx.variantAttribute.create({ data: { variantId: v.id, attributeId: a.attributeId, valueId: a.valueId } });
      }
    }
    if (Array.isArray(media)) {
      for (const m of media) {
        await tx.media.create({ data: { storeId: product.storeId, productId: productId, url: m.url, type: m.type || 'IMAGE', altText: m.altText || null, meta: m.meta || null } });
      }
    }
    return v;
  });
  reply.code(201).send(created);
}

async function update(request, reply) {
  const { id } = request.params || {};
  const body = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.productVariant.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'variant not found' });
  if (body.sku && body.sku !== existing.sku) {
    const conflict = await prisma.productVariant.findUnique({ where: { sku: body.sku } });
    if (conflict) return reply.code(409).send({ error: 'sku already exists' });
  }
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.barcode !== undefined) data.barcode = body.barcode;
  if (body.price !== undefined) data.price = body.price;
  if (body.compareAt !== undefined) data.compareAt = body.compareAt;
  if (body.weightKg !== undefined) data.weightKg = body.weightKg;
  if (body.dimensions !== undefined) data.dimensions = body.dimensions;
  if (body.customData !== undefined) data.customData = body.customData;
  if (body.sku !== undefined) data.sku = body.sku;
  if (body.status !== undefined) data.status = body.status;
  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.productVariant.update({ where: { id }, data });
    if (Array.isArray(body.attributes)) {
      await tx.variantAttribute.deleteMany({ where: { variantId: id } });
      for (const a of body.attributes) {
        await tx.variantAttribute.create({ data: { variantId: id, attributeId: a.attributeId, valueId: a.valueId } });
      }
    }
    if (Array.isArray(body.media)) {
      for (const m of body.media) {
        if (m.id) {
          await tx.media.update({ where: { id: m.id }, data: { url: m.url, altText: m.altText || null, meta: m.meta || null } });
        } else {
          const prod = await tx.product.findUnique({ where: { id: v.productId } });
          await tx.media.create({ data: { storeId: prod.storeId, productId: v.productId, url: m.url, type: m.type || 'IMAGE', altText: m.altText || null, meta: m.meta || null } });
        }
      }
    }
    return v;
  });
  reply.send(updated);
}

async function remove(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const variant = await prisma.productVariant.findUnique({ where: { id } });
  if (!variant) return reply.code(404).send({ error: 'variant not found' });
  await prisma.$transaction(async (tx) => {
    await tx.variantAttribute.deleteMany({ where: { variantId: id } });
    await tx.inventoryItem.deleteMany({ where: { variantId: id } });
    await tx.productVariant.delete({ where: { id } });
  });
  reply.send({ ok: true });
}

async function setPrices(request, reply) {
  const { id } = request.params || {};
  const { price, compareAt, priceHistoryEntry } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.productVariant.findUnique({ where: { id }, include: { product: true } });
  if (!existing) return reply.code(404).send({ error: 'variant not found' });
  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.productVariant.update({ where: { id }, data: { price: price !== undefined ? price : existing.price, compareAt: compareAt !== undefined ? compareAt : existing.compareAt } });
    if (priceHistoryEntry) {
      await tx.priceHistory.create({
        data: {
          variantId: id,
          price: priceHistoryEntry.price,
          reason: priceHistoryEntry.reason || null,
          startAt: priceHistoryEntry.startAt || null,
          endAt: priceHistoryEntry.endAt || null
        }
      });
    }
    return v;
  });
  reply.send(updated);
}

async function inventory(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'variant id required' });
  const items = await prisma.inventoryItem.findMany({
    where: { variantId: id },
    include: { warehouse: true },
    orderBy: { lastUpdated: 'desc' }
  });
  const totalAvailable = items.reduce((acc, it) => acc + Math.max(0, (it.quantity - it.reserved)), 0);
  reply.send({ items, totalAvailable });
}

module.exports = {
  list,
  getById,
  getBySku,
  create,
  update,
  remove,
  setPrices,
  inventory
};
