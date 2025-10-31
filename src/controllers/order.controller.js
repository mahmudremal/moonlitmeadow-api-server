const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function list(request, reply) {
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 20);
  const storeId = request.query.storeId || undefined;
  const status = request.query.status || undefined;
  const where = {};
  if (storeId) where.storeId = storeId;
  if (status) where.status = status;
  const items = await prisma.order.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { createdAt: 'desc' },
    include: { items: true, payments: true, fulfillments: true }
  });
  const total = await prisma.order.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true, payments: true, fulfillments: true } });
  if (!order) return reply.code(404).send({ error: 'order not found' });
  reply.send(order);
}

async function getByNumber(request, reply) {
  const { orderNumber } = request.params || {};
  if (!orderNumber) return reply.code(400).send({ error: 'orderNumber required' });
  const order = await prisma.order.findUnique({ where: { orderNumber }, include: { items: true, payments: true, fulfillments: true } });
  if (!order) return reply.code(404).send({ error: 'order not found' });
  reply.send(order);
}

async function create(request, reply) {
  const { storeId, userId, items, billing, shipping, metadata } = request.body || {};
  if (!storeId || !Array.isArray(items) || items.length === 0) return reply.code(400).send({ error: 'storeId and items required' });
  const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const totals = { subtotal: 0, discount: 0, tax: 0, shipping: 0, grandTotal: 0 };
  const created = await prisma.$transaction(async (tx) => {
    for (const it of items) {
      const v = await tx.productVariant.findUnique({ where: { id: it.variantId } });
      if (!v) throw new Error('variant_not_found');
      totals.subtotal += v.price * it.quantity;
    }
    const order = await tx.order.create({
      data: {
        storeId,
        userId: userId || null,
        orderNumber,
        status: 'PENDING',
        totals,
        billing: billing || null,
        shipping: shipping || null,
        metadata: metadata || null
      }
    });
    for (const it of items) {
      const v = await tx.productVariant.findUnique({ where: { id: it.variantId } });
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          variantId: v.id,
          sku: v.sku,
          title: v.title || null,
          quantity: it.quantity,
          unitPrice: v.price,
          totalPrice: v.price * it.quantity,
          taxAmount: 0,
          discount: 0
        }
      });
    }
    return order;
  }).catch(err => {
    if (err.message === 'variant_not_found') return reply.code(404).send({ error: 'variant not found' });
    return reply.code(500).send({ error: 'order creation failed', detail: err.message });
  });
  if (created && created.id) {
    const order = await prisma.order.findUnique({ where: { id: created.id }, include: { items: true } });
    return reply.code(201).send(order);
  }
}

async function cancel(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return reply.code(404).send({ error: 'order not found' });
  if (['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.status)) return reply.code(409).send({ error: 'cannot cancel order in current status' });
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
    for (const it of order.items) {
      const inventories = await tx.inventoryItem.findMany({ where: { variantId: it.variantId } });
      for (const inv of inventories) {
        const dec = Math.min(inv.reserved, it.quantity);
        if (dec > 0) await tx.inventoryItem.update({ where: { id: inv.id }, data: { reserved: inv.reserved - dec } });
      }
    }
  });
  reply.send({ ok: true });
}

async function confirm(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return reply.code(404).send({ error: 'order not found' });
  if (order.status !== 'PENDING') return reply.code(409).send({ error: 'only pending orders can be confirmed' });
  await prisma.$transaction(async (tx) => {
    for (const it of order.items) {
      let remaining = it.quantity;
      const invs = await tx.inventoryItem.findMany({ where: { variantId: it.variantId }, orderBy: { reserved: 'desc' } });
      for (const inv of invs) {
        if (remaining <= 0) break;
        const used = Math.min(inv.reserved, remaining);
        if (used > 0) {
          await tx.inventoryItem.update({ where: { id: inv.id }, data: { reserved: inv.reserved - used, quantity: Math.max(0, inv.quantity - used) } });
          remaining -= used;
        }
      }
      if (remaining > 0) {
        throw new Error('insufficient_reserved_stock');
      }
    }
    await tx.order.update({ where: { id }, data: { status: 'CONFIRMED' } });
  }).catch(err => {
    if (err.message === 'insufficient_reserved_stock') return reply.code(409).send({ error: 'insufficient reserved stock to confirm' });
    return reply.code(500).send({ error: 'confirm failed', detail: err.message });
  });
  const updated = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  reply.send(updated);
}

async function createFulfillment(request, reply) {
  const { id } = request.params || {};
  const { items, tracking, shippedAt } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return reply.code(404).send({ error: 'order not found' });
  const f = await prisma.fulfillment.create({
    data: {
      orderId: id,
      items: items || order.items.map(it => ({ orderItemId: it.id, qty: it.quantity })),
      status: 'SHIPPED',
      tracking: tracking || null,
      shippedAt: shippedAt || new Date()
    }
  });
  await prisma.order.update({ where: { id }, data: { status: 'SHIPPED' } });
  reply.code(201).send(f);
}

async function refund(request, reply) {
  const { id } = request.params || {};
  const { amount, reason } = request.body || {};
  if (!id || typeof amount !== 'number' || amount <= 0) return reply.code(400).send({ error: 'id and positive amount required' });
  const order = await prisma.order.findUnique({ where: { id }, include: { payments: true } });
  if (!order) return reply.code(404).send({ error: 'order not found' });
  const payment = (order.payments && order.payments[0]) || null;
  const refund = await prisma.payment.create({
    data: {
      orderId: id,
      provider: payment ? payment.provider : 'manual',
      method: payment ? payment.method : 'refund',
      amount: -Math.abs(amount),
      status: 'REFUNDED',
      raw: { reason: reason || null }
    }
  });
  await prisma.order.update({ where: { id }, data: { status: 'REFUNDED' } });
  reply.send({ ok: true, refund });
}

module.exports = {
  list,
  getById,
  getByNumber,
  create,
  cancel,
  confirm,
  createFulfillment,
  refund
};
