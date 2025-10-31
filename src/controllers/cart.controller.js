const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function getById(request, reply) {
  const { id } = request.params || {};
  const userId = request.user && request.user.sub;
  if (!id) return reply.code(400).send({ error: 'id required' });
  const cart = await prisma.cart.findUnique({
    where: { id },
    include: { items: { include: { variant: { include: { product: true } } } } }
  });
  if (!cart) return reply.code(404).send({ error: 'cart not found' });
  if (cart.userId && userId && cart.userId !== userId) return reply.code(403).send({ error: 'forbidden' });
  reply.send(cart);
}

async function create(request, reply) {
  const { storeId, userId, meta } = request.body || {};
  if (!storeId) return reply.code(400).send({ error: 'storeId required' });
  const cart = await prisma.cart.create({ data: { storeId, userId: userId || null, meta: meta || null }, include: { items: true } });
  reply.code(201).send(cart);
}

async function addItem(request, reply) {
  const { id } = request.params || {};
  const { variantId, quantity } = request.body || {};
  if (!id || !variantId || typeof quantity !== 'number' || quantity <= 0) return reply.code(400).send({ error: 'cart id, variantId and positive quantity required' });
  const cart = await prisma.cart.findUnique({ where: { id }, include: { items: true } });
  if (!cart) return reply.code(404).send({ error: 'cart not found' });
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) return reply.code(404).send({ error: 'variant not found' });
  const existing = cart.items.find(it => it.variantId === variantId);
  if (existing) {
    const updated = await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + Math.floor(quantity) } });
    reply.send(updated);
  } else {
    const item = await prisma.cartItem.create({ data: { cartId: id, variantId, quantity: Math.floor(quantity), priceAt: variant.price } });
    reply.code(201).send(item);
  }
}

async function updateItem(request, reply) {
  const { id, itemId } = request.params || {};
  const { quantity } = request.body || {};
  if (!id || !itemId) return reply.code(400).send({ error: 'cart id and item id required' });
  if (typeof quantity !== 'number' || quantity < 0) return reply.code(400).send({ error: 'quantity must be number >= 0' });
  const cart = await prisma.cart.findUnique({ where: { id } });
  if (!cart) return reply.code(404).send({ error: 'cart not found' });
  if (quantity === 0) {
    await prisma.cartItem.delete({ where: { id: itemId } });
    return reply.send({ ok: true });
  }
  const item = await prisma.cartItem.update({ where: { id: itemId }, data: { quantity: Math.floor(quantity) } });
  reply.send(item);
}

async function removeItem(request, reply) {
  const { id, itemId } = request.params || {};
  if (!id || !itemId) return reply.code(400).send({ error: 'cart id and item id required' });
  const cart = await prisma.cart.findUnique({ where: { id } });
  if (!cart) return reply.code(404).send({ error: 'cart not found' });
  await prisma.cartItem.delete({ where: { id: itemId } });
  reply.send({ ok: true });
}

async function merge(request, reply) {
  const { id } = request.params || {};
  const { sourceCartId } = request.body || {};
  if (!id || !sourceCartId) return reply.code(400).send({ error: 'target and source cart ids required' });
  const target = await prisma.cart.findUnique({ where: { id }, include: { items: true } });
  const source = await prisma.cart.findUnique({ where: { id: sourceCartId }, include: { items: true } });
  if (!target || !source) return reply.code(404).send({ error: 'cart not found' });
  await prisma.$transaction(async (tx) => {
    for (const s of source.items) {
      const found = target.items.find(t => t.variantId === s.variantId);
      if (found) {
        await tx.cartItem.update({ where: { id: found.id }, data: { quantity: found.quantity + s.quantity } });
      } else {
        await tx.cartItem.create({ data: { cartId: target.id, variantId: s.variantId, quantity: s.quantity, priceAt: s.priceAt } });
      }
    }
    await tx.cartItem.deleteMany({ where: { cartId: source.id } });
    await tx.cart.delete({ where: { id: source.id } });
  });
  const updated = await prisma.cart.findUnique({ where: { id }, include: { items: true } });
  reply.send(updated);
}

async function checkout(request, reply) {
  const { id } = request.params || {};
  const userId = request.user && request.user.sub;
  const { billing, shipping, paymentMethod, shippingMethod, couponCode } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'cart id required' });
  const cart = await prisma.cart.findUnique({ where: { id }, include: { items: { include: { variant: { include: { product: true } } } }, store: true } });
  if (!cart) return reply.code(404).send({ error: 'cart not found' });
  if (!cart.items || cart.items.length === 0) return reply.code(400).send({ error: 'cart is empty' });
  const totals = { subtotal: 0, discount: 0, tax: 0, shipping: 0, grandTotal: 0 };
  for (const it of cart.items) {
    totals.subtotal += it.priceAt * it.quantity;
  }
  const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const allocations = [];
  await prisma.$transaction(async (tx) => {
    for (const it of cart.items) {
      let remaining = it.quantity;
      const invs = await tx.inventoryItem.findMany({ where: { variantId: it.variantId }, orderBy: { quantity: 'desc' } });
      const availableTotal = invs.reduce((acc, iv) => acc + Math.max(0, iv.quantity - iv.reserved), 0);
      if (availableTotal < remaining) throw new Error('insufficient_stock');
      for (const inv of invs) {
        if (remaining <= 0) break;
        const free = Math.max(0, inv.quantity - inv.reserved);
        if (free <= 0) continue;
        const take = Math.min(free, remaining);
        await tx.inventoryItem.update({ where: { id: inv.id }, data: { reserved: inv.reserved + take, quantity: inv.quantity } });
        allocations.push({ inventoryId: inv.id, variantId: it.variantId, qty: take });
        remaining -= take;
      }
    }
    const order = await tx.order.create({
      data: {
        storeId: cart.storeId,
        userId: userId || cart.userId || null,
        orderNumber,
        status: 'PENDING',
        totals: totals,
        billing: billing || null,
        shipping: shipping || null,
        metadata: { paymentMethod: paymentMethod || null, shippingMethod: shippingMethod || null, couponCode: couponCode || null }
      }
    });
    const items = [];
    for (const it of cart.items) {
      const line = await tx.orderItem.create({
        data: {
          orderId: order.id,
          variantId: it.variantId,
          sku: it.variant.sku,
          title: it.variant.title || it.variant.product.title,
          quantity: it.quantity,
          unitPrice: it.priceAt,
          totalPrice: it.priceAt * it.quantity,
          taxAmount: 0,
          discount: 0
        }
      });
      items.push(line);
    }
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.cart.delete({ where: { id: cart.id } });
  }).catch(err => {
    if (err.message === 'insufficient_stock') return reply.code(409).send({ error: 'insufficient stock' });
    return reply.code(500).send({ error: 'checkout failed', detail: err.message });
  });
  const createdOrder = await prisma.order.findFirst({ where: { orderNumber }, include: { items: true, payments: true, fulfillments: true } });
  reply.code(201).send(createdOrder);
}

module.exports = {
  getById,
  create,
  addItem,
  updateItem,
  removeItem,
  merge,
  checkout
};
