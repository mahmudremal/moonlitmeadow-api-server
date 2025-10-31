const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function payment(request, reply) {
  const provider = (request.params && request.params.provider) || null;
  const payload = request.body || {};
  if (!provider) return reply.code(400).send({ error: 'provider required' });
  try {
    if (provider === 'stripe') {
      const event = payload;
      if (event && event.type === 'payment_intent.succeeded') {
        const obj = event.data && event.data.object;
        const meta = obj && obj.metadata;
        const orderId = meta && meta.orderId;
        const amount = obj && (obj.amount_received ? obj.amount_received / 100 : null);
        if (orderId) {
          await prisma.payment.create({ data: { orderId, provider: 'stripe', method: 'card', amount: amount || 0, status: 'CAPTURED', raw: payload } });
          await prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
        }
      } else if (event && event.type === 'payment_intent.payment_failed') {
        const obj = event.data && event.data.object;
        const meta = obj && obj.metadata;
        const orderId = meta && meta.orderId;
        if (orderId) {
          await prisma.payment.create({ data: { orderId, provider: 'stripe', method: 'card', amount: 0, status: 'FAILED', raw: payload } });
        }
      }
    } else if (provider === 'sslcommerz') {
      const txn = payload;
      const orderId = txn.tran_id || txn.order_id || txn.merchant_order_id || null;
      const status = (txn.status || '').toLowerCase();
      const amount = txn.amount ? parseFloat(txn.amount) : 0;
      if (orderId && status === 'valid') {
        await prisma.payment.create({ data: { orderId, provider: 'sslcommerz', method: txn.payment_method || 'card', amount, status: 'CAPTURED', raw: payload } });
        await prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
      } else if (orderId) {
        await prisma.payment.create({ data: { orderId, provider: 'sslcommerz', method: txn.payment_method || null, amount, status: 'FAILED', raw: payload } });
      }
    } else if (provider === 'card') {
      const body = payload;
      const orderId = body.orderId || body.merchant_order_id || null;
      const success = body.success === true || String(body.status).toLowerCase() === 'captured' || String(body.status).toLowerCase() === 'ok';
      const amount = body.amount ? parseFloat(body.amount) : 0;
      if (orderId && success) {
        await prisma.payment.create({ data: { orderId, provider: 'card', method: 'card', amount, status: 'CAPTURED', raw: payload } });
        await prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
      } else {
        await prisma.payment.create({ data: { orderId: orderId || null, provider: 'card', method: 'card', amount, status: 'FAILED', raw: payload } });
      }
    } else {
      await prisma.payment.create({ data: { orderId: payload.orderId || null, provider, method: payload.method || null, amount: payload.amount ? parseFloat(payload.amount) : 0, status: payload.status || 'PENDING', raw: payload } });
      if (payload.orderId && String(payload.status).toUpperCase() === 'CAPTURED') {
        await prisma.order.update({ where: { id: payload.orderId }, data: { status: 'CONFIRMED' } });
      }
    }
    reply.send({ ok: true });
  } catch (err) {
    reply.code(500).send({ error: 'webhook_error', detail: err.message });
  }
}

async function shipping(request, reply) {
  const provider = (request.params && request.params.provider) || null;
  const payload = request.body || {};
  if (!provider) return reply.code(400).send({ error: 'provider required' });
  try {
    if (provider === 'shiprocket' || provider === 'local_courier') {
      const orderId = payload.orderId || payload.merchant_order_id || payload.order_id || null;
      const status = payload.status || payload.stage || null;
      const tracking = payload.tracking || payload.tracking_number || payload.awb || null;
      const shippedAt = payload.shipped_at || payload.shippedDate || null;
      if (orderId && status) {
        await prisma.fulfillment.create({ data: { orderId, items: payload.items || null, status: String(status).toUpperCase(), tracking: { provider, tracking }, shippedAt: shippedAt ? new Date(shippedAt) : null } });
        await prisma.order.update({ where: { id: orderId }, data: { status: status === 'delivered' || String(status).toLowerCase() === 'delivered' ? 'DELIVERED' : 'SHIPPED' } });
      }
    } else {
      const orderId = payload.orderId || null;
      if (orderId) {
        await prisma.fulfillment.create({ data: { orderId, items: payload.items || null, status: payload.status || 'PENDING', tracking: payload.tracking || null, shippedAt: payload.shippedAt ? new Date(payload.shippedAt) : null } });
      }
    }
    reply.send({ ok: true });
  } catch (err) {
    reply.code(500).send({ error: 'webhook_error', detail: err.message });
  }
}

async function cms(request, reply) {
  const provider = (request.params && request.params.provider) || null;
  const payload = request.body || {};
  if (!provider) return reply.code(400).send({ error: 'provider required' });
  try {
    if (provider === 'headless_cms') {
      const action = payload.action || null;
      if (action === 'product.updated' && payload.product && payload.product.id) {
        await prisma.product.update({ where: { id: payload.product.id }, data: { updatedAt: new Date(), customData: payload.product.customData || undefined } });
      } else if (action === 'product.deleted' && payload.product && payload.product.id) {
        await prisma.product.update({ where: { id: payload.product.id }, data: { status: 'ARCHIVED' } });
      } else if (action === 'category.updated' && payload.category && payload.category.id) {
        await prisma.category.update({ where: { id: payload.category.id }, data: { name: payload.category.name || undefined, slug: payload.category.slug || undefined } });
      }
    } else {
      await prisma.activityLog.create({ data: { action: `cms.${provider}`, payload } });
    }
    reply.send({ ok: true });
  } catch (err) {
    reply.code(500).send({ error: 'webhook_error', detail: err.message });
  }
}

module.exports = {
  payment,
  shipping,
  cms
};
