const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

async function list(request, reply) {
  const storeId = request.query.storeId || undefined;
  const status = request.query.status || undefined;
  const page = parseInt(request.query.page || '1', 10) || 1;
  const perPage = parseInt(request.query.perPage || '20', 10) || 20;
  const where = {};
  if (storeId) where.storeId = storeId;
  if (status) where.status = status;
  const items = await prisma.fulfillment.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { createdAt: 'desc' },
    include: { order: true }
  });
  const total = await prisma.fulfillment.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const f = await prisma.fulfillment.findUnique({
    where: { id },
    include: { order: { include: { items: true, payments: true } } }
  });
  if (!f) return reply.code(404).send({ error: 'fulfillment not found' });
  reply.send(f);
}

async function track(request, reply) {
  const { id } = request.params || {};
  const { tracking } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  if (!tracking) return reply.code(400).send({ error: 'tracking required' });
  const f = await prisma.fulfillment.findUnique({ where: { id } });
  if (!f) return reply.code(404).send({ error: 'fulfillment not found' });
  const newTracking = Object.assign({}, f.tracking || {}, tracking);
  const updated = await prisma.fulfillment.update({ where: { id }, data: { tracking: newTracking } });
  reply.send(updated);
}

async function ship(request, reply) {
  const { id } = request.params || {};
  const { carrier, trackingNumber, shippedAt } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const fulfillment = await prisma.fulfillment.findUnique({ where: { id }, include: { order: { include: { items: true } } } });
  if (!fulfillment) return reply.code(404).send({ error: 'fulfillment not found' });
  if (fulfillment.status === 'SHIPPED' || fulfillment.status === 'DELIVERED') return reply.code(409).send({ error: 'already shipped or delivered' });
  const shipDate = parseDate(shippedAt) || new Date();
  const tracking = Object.assign({}, fulfillment.tracking || {}, { carrier: carrier || null, trackingNumber: trackingNumber || null, shippedAt: shipDate });
  await prisma.$transaction(async (tx) => {
    await tx.fulfillment.update({ where: { id }, data: { status: 'SHIPPED', tracking, shippedAt: shipDate } });
    await tx.order.update({ where: { id: fulfillment.orderId }, data: { status: 'SHIPPED' } });
  });
  const updated = await prisma.fulfillment.findUnique({ where: { id } });
  reply.code(201).send(updated);
}

async function returnFulfillment(request, reply) {
  const { id } = request.params || {};
  const { reason, items, receivedAt } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const f = await prisma.fulfillment.findUnique({ where: { id }, include: { order: { include: { items: true } } } });
  if (!f) return reply.code(404).send({ error: 'fulfillment not found' });
  const recv = parseDate(receivedAt) || new Date();
  const returnRecord = { reason: reason || null, items: items || null, receivedAt: recv };
  await prisma.$transaction(async (tx) => {
    await tx.fulfillment.update({ where: { id }, data: { status: 'RETURNED', tracking: Object.assign({}, f.tracking || {}, { return: returnRecord }) } });
    await tx.order.update({ where: { id: f.orderId }, data: { status: 'RETURNED' } });
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        const orderItemId = it.orderItemId;
        const qty = Math.max(0, parseInt(it.qty || it.quantity || 0, 10));
        if (!orderItemId || qty <= 0) continue;
        const orderItem = await tx.orderItem.findUnique({ where: { id: orderItemId } });
        if (!orderItem) continue;
        const invs = await tx.inventoryItem.findMany({ where: { variantId: orderItem.variantId }, orderBy: { id: 'asc' } });
        if (invs && invs.length) {
          await tx.inventoryItem.update({ where: { id: invs[0].id }, data: { quantity: invs[0].quantity + qty } });
        } else {
          const wh = await tx.warehouse.findFirst({});
          if (wh) {
            await tx.inventoryItem.create({ data: { variantId: orderItem.variantId, warehouseId: wh.id, quantity: qty, reserved: 0, incoming: 0, safetyStock: 0 } });
          }
        }
      }
    }
  });
  const updated = await prisma.fulfillment.findUnique({ where: { id } });
  reply.send(updated);
}

module.exports = {
  list,
  getById,
  track,
  ship,
  return: returnFulfillment
};
