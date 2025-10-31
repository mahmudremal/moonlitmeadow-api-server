const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function list(request, reply) {
  const campaignId = request.query.campaignId || undefined;
  const code = request.query.code || undefined;
  const items = await prisma.coupon.findMany({
    where: campaignId ? { campaignId } : code ? { code } : {},
    orderBy: { createdAt: 'desc' }
  });
  reply.send({ data: items });
}

async function getByCode(request, reply) {
  const { code } = request.params || {};
  if (!code) return reply.code(400).send({ error: 'code required' });
  const c = await prisma.coupon.findUnique({ where: { code } });
  if (!c) return reply.code(404).send({ error: 'coupon not found' });
  reply.send(c);
}

async function create(request, reply) {
  const { campaignId, code, usageLimit, expiresAt, meta } = request.body || {};
  if (!campaignId || !code) return reply.code(400).send({ error: 'campaignId and code required' });
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
  const exists = await prisma.coupon.findUnique({ where: { code } });
  if (exists) return reply.code(409).send({ error: 'coupon code already exists' });
  const created = await prisma.coupon.create({
    data: {
      campaignId,
      code,
      usageLimit: usageLimit || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      meta: meta || null
    }
  });
  reply.code(201).send(created);
}

async function update(request, reply) {
  const { id } = request.params || {};
  const { usageLimit, expiresAt, meta } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'coupon not found' });
  const data = {};
  if (usageLimit !== undefined) data.usageLimit = usageLimit;
  if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (meta !== undefined) data.meta = meta;
  const updated = await prisma.coupon.update({ where: { id }, data });
  reply.send(updated);
}

async function validate(request, reply) {
  const { code, orderId, userId } = request.body || {};
  if (!code) return reply.code(400).send({ error: 'code required' });
  const coupon = await prisma.coupon.findUnique({ where: { code }, include: { campaign: true } });
  if (!coupon) return reply.code(404).send({ error: 'coupon not found' });
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return reply.code(410).send({ error: 'coupon expired' });
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return reply.code(409).send({ error: 'coupon usage limit reached' });
  if (coupon.campaign && (!coupon.campaign.active || coupon.campaign.startsAt > new Date() || coupon.campaign.endsAt < new Date())) return reply.code(409).send({ error: 'campaign not active' });
  const usageCount = await prisma.coupon.count({ where: { id: coupon.id, usedCount: { gte: 0 } } });
  const result = { valid: true, coupon: { id: coupon.id, code: coupon.code, campaignId: coupon.campaignId, meta: coupon.meta } };
  if (orderId) {
    await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: coupon.usedCount + 1 } });
  }
  reply.send(result);
}

module.exports = {
  list,
  getByCode,
  create,
  update,
  validate
};
