const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function byVariant(request, reply) {
  const { variantId } = request.params || {};
  if (!variantId) return reply.code(400).send({ error: 'variantId required' });
  const items = await prisma.inventoryItem.findMany({
    where: { variantId },
    include: { warehouse: true },
    orderBy: { lastUpdated: 'desc' }
  });
  const totalAvailable = items.reduce((acc, it) => acc + Math.max(0, it.quantity - it.reserved), 0);
  reply.send({ items, totalAvailable });
}

async function byVariantDetailed(request, reply) {
  const { variantId } = request.params || {};
  if (!variantId) return reply.code(400).send({ error: 'variantId required' });
  const items = await prisma.inventoryItem.findMany({
    where: { variantId },
    include: { warehouse: true }
  });
  reply.send(items);
}

async function reserve(request, reply) {
  const { variantId, quantity, strategy } = request.body || {};
  if (!variantId || typeof quantity !== 'number' || quantity <= 0) return reply.code(400).send({ error: 'variantId and positive quantity required' });
  const qtyToReserve = Math.floor(quantity);
  const strategyName = strategy || 'largest-first';
  const inventories = await prisma.inventoryItem.findMany({
    where: { variantId },
    orderBy: strategyName === 'smallest-first' ? { quantity: 'asc' } : { quantity: 'desc' }
  });
  const availableTotal = inventories.reduce((acc, it) => acc + Math.max(0, it.quantity - it.reserved), 0);
  if (availableTotal < qtyToReserve) return reply.code(409).send({ error: 'insufficient stock', available: availableTotal });
  const allocations = [];
  let remaining = qtyToReserve;
  for (const inv of inventories) {
    if (remaining <= 0) break;
    const free = Math.max(0, inv.quantity - inv.reserved);
    if (free <= 0) continue;
    const take = Math.min(free, remaining);
    allocations.push({ inventoryId: inv.id, take });
    remaining -= take;
  }
  if (remaining > 0) return reply.code(409).send({ error: 'insufficient stock after allocation' });
  const reservations = [];
  await prisma.$transaction(async (tx) => {
    for (const a of allocations) {
      const inv = await tx.inventoryItem.findUnique({ where: { id: a.inventoryId } });
      if (!inv) throw new Error('inventory miss');
      const free = Math.max(0, inv.quantity - inv.reserved);
      if (free < a.take) throw new Error('concurrent stock change');
      await tx.inventoryItem.update({ where: { id: a.inventoryId }, data: { reserved: inv.reserved + a.take } });
      reservations.push({ inventoryId: a.inventoryId, quantity: a.take });
    }
  }).catch(err => {
    return reply.code(500).send({ error: 'reservation failed', detail: err.message });
  });
  reply.code(201).send({ reserved: qtyToReserve, allocations: reservations });
}

async function release(request, reply) {
  const { variantId, allocations } = request.body || {};
  if (!variantId || !Array.isArray(allocations) || allocations.length === 0) return reply.code(400).send({ error: 'variantId and allocations required' });
  await prisma.$transaction(async (tx) => {
    for (const a of allocations) {
      const inv = await tx.inventoryItem.findUnique({ where: { id: a.inventoryId } });
      if (!inv) continue;
      const dec = Math.max(0, Math.floor(a.quantity));
      const newReserved = Math.max(0, inv.reserved - dec);
      await tx.inventoryItem.update({ where: { id: a.inventoryId }, data: { reserved: newReserved } });
    }
  });
  reply.send({ ok: true });
}

async function adjust(request, reply) {
  const { adjustments } = request.body || {};
  if (!Array.isArray(adjustments) || adjustments.length === 0) return reply.code(400).send({ error: 'adjustments required' });
  const results = [];
  await prisma.$transaction(async (tx) => {
    for (const a of adjustments) {
      const { inventoryId, setQuantity, delta, setSafetyStock } = a;
      if (!inventoryId) continue;
      const inv = await tx.inventoryItem.findUnique({ where: { id: inventoryId } });
      if (!inv) continue;
      let newQty = inv.quantity;
      if (typeof setQuantity === 'number') newQty = Math.max(0, Math.floor(setQuantity));
      if (typeof delta === 'number') newQty = Math.max(0, newQty + Math.floor(delta));
      const data = { quantity: newQty };
      if (typeof setSafetyStock === 'number') data.safetyStock = Math.max(0, Math.floor(setSafetyStock));
      const updated = await tx.inventoryItem.update({ where: { id: inventoryId }, data });
      results.push(updated);
    }
  });
  reply.send({ updated: results.length, results });
}

async function lowStock(request, reply) {
  const storeId = request.query.storeId || undefined;
  const threshold = parseIntOrDefault(request.query.threshold, undefined);
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 50);
  const where = {};
  if (storeId) where.warehouse = { storeId };
  const items = await prisma.inventoryItem.findMany({
    where,
    include: { warehouse: true, variant: { include: { product: true } } }
  });
  const filtered = items.filter(it => {
    const avail = Math.max(0, it.quantity - it.reserved);
    if (typeof threshold === 'number') return avail <= threshold;
    return avail <= (it.safetyStock || 0);
  });
  const start = (page - 1) * perPage;
  const pageItems = filtered.slice(start, start + perPage);
  reply.send({ data: pageItems, meta: { page, perPage, total: filtered.length } });
}

module.exports = {
  byVariant,
  byVariantDetailed,
  reserve,
  release,
  adjust,
  lowStock
};
