const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fetch = require('node-fetch');

const PAYMENT_PROVIDERS = [
  { id: 'stripe', name: 'Stripe', methods: ['card', 'apple_pay', 'google_pay'] },
  { id: 'sslcommerz', name: 'SSLCommerz', methods: ['card', 'mobile_banking'] },
  { id: 'card', name: 'GatewayCard', methods: ['card'] },
  { id: 'manual', name: 'Manual', methods: ['bank_transfer'] }
];

function parseFloatOrDefault(v, d) {
  const n = parseFloat(v);
  return Number.isNaN(n) ? d : n;
}

async function listProviders(request, reply) {
  reply.send(PAYMENT_PROVIDERS);
}

async function charge(request, reply) {
  const provider = (request.params && request.params.provider) || null;
  const body = request.body || {};
  const { orderId, amount, currency, method, token, description } = body;
  if (!provider || !orderId || !amount) return reply.code(400).send({ error: 'provider, orderId and amount required' });
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
  if (!order) return reply.code(404).send({ error: 'order not found' });
  const amt = parseFloatOrDefault(amount, 0);
  if (amt <= 0) return reply.code(400).send({ error: 'invalid amount' });
  const payment = await prisma.payment.create({
    data: {
      orderId,
      provider,
      method: method || null,
      amount: amt,
      status: 'PENDING',
      raw: { request: body }
    }
  });
  try {
    let result = { success: false, providerResponse: null };
    if (provider === 'stripe') {
      result = { success: true, providerResponse: { id: `stripe_tx_${Date.now()}`, captured: true } };
    } else if (provider === 'sslcommerz') {
      result = { success: true, providerResponse: { id: `ssl_tx_${Date.now()}`, captured: true } };
    } else if (provider === 'card') {
      result = { success: true, providerResponse: { id: `card_tx_${Date.now()}`, captured: true } };
    } else if (provider === 'manual') {
      result = { success: true, providerResponse: { id: `manual_${Date.now()}`, captured: false } };
    } else {
      result = { success: false, providerResponse: { message: 'unknown provider' } };
    }
    if (result.success) {
      const newStatus = result.providerResponse.captured ? 'CAPTURED' : 'AUTHORIZED';
      await prisma.payment.update({ where: { id: payment.id }, data: { status: newStatus, raw: { ...payment.raw, providerResponse: result.providerResponse } } });
      if (newStatus === 'CAPTURED') {
        await prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
      }
      reply.send({ ok: true, paymentId: payment.id, status: newStatus, providerResponse: result.providerResponse });
    } else {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', raw: { ...payment.raw, providerResponse: result.providerResponse } } });
      reply.code(402).send({ error: 'payment_failed', detail: result.providerResponse });
    }
  } catch (err) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', raw: { ...payment.raw, error: err.message } } });
    reply.code(500).send({ error: 'payment_error', detail: err.message });
  }
}

async function webhook(request, reply) {
  const provider = (request.params && request.params.provider) || null;
  const payload = request.body || {};
  if (!provider) return reply.code(400).send({ error: 'provider required' });
  try {
    if (provider === 'stripe') {
      const event = payload;
      if (event && event.type === 'payment_intent.succeeded') {
        const meta = event.data && event.data.object && event.data.object.metadata;
        const orderId = meta && meta.orderId;
        const amount = event.data.object.amount_received / 100;
        if (orderId) {
          await prisma.payment.create({ data: { orderId, provider: 'stripe', method: 'card', amount, status: 'CAPTURED', raw: payload } });
          await prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
        }
      }
    } else if (provider === 'sslcommerz') {
      const txn = payload;
      const orderId = txn.tran_id || txn.order_id || null;
      const status = txn.status || null;
      const amount = parseFloatOrDefault(txn.amount, 0);
      if (orderId && status === 'VALID') {
        await prisma.payment.create({ data: { orderId, provider: 'sslcommerz', method: txn.payment_method || 'card', amount, status: 'CAPTURED', raw: payload } });
        await prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
      } else if (orderId) {
        await prisma.payment.create({ data: { orderId, provider: 'sslcommerz', method: txn.payment_method || null, amount, status: 'FAILED', raw: payload } });
      }
    } else {
      await prisma.payment.create({ data: { orderId: payload.orderId || null, provider, method: payload.method || null, amount: parseFloatOrDefault(payload.amount, 0), status: payload.status || 'PENDING', raw: payload } });
      if (payload.orderId && payload.status === 'CAPTURED') {
        await prisma.order.update({ where: { id: payload.orderId }, data: { status: 'CONFIRMED' } });
      }
    }
    reply.send({ ok: true });
  } catch (err) {
    reply.code(500).send({ error: 'webhook_processing_failed', detail: err.message });
  }
}

module.exports = {
  listProviders,
  charge,
  webhook
};
