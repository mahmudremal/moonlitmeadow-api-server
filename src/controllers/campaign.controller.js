const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function list(request, reply) {
  const storeId = request.query.storeId || undefined;
  const active = request.query.active;
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 20);
  const where = {};
  if (storeId) where.storeId = storeId;
  if (active !== undefined) where.active = String(active) === 'true';
  const items = await prisma.campaign.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { startsAt: 'desc' },
    include: { coupons: true }
  });
  const total = await prisma.campaign.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const c = await prisma.campaign.findUnique({ where: { id }, include: { coupons: true } });
  if (!c) return reply.code(404).send({ error: 'campaign not found' });
  reply.send(c);
}

async function create(request, reply) {
  const { storeId, name, type, rules, startsAt, endsAt, active } = request.body || {};
  if (!storeId || !name || !startsAt || !endsAt) return reply.code(400).send({ error: 'storeId, name, startsAt and endsAt required' });
  const created = await prisma.campaign.create({
    data: {
      storeId,
      name,
      type: type || 'PERCENTAGE',
      rules: rules || null,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      active: !!active
    },
    include: { coupons: true }
  });
  reply.code(201).send(created);
}

async function update(request, reply) {
  const { id } = request.params || {};
  const { name, type, rules, startsAt, endsAt, active } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'campaign not found' });
  const data = {};
  if (name !== undefined) data.name = name;
  if (type !== undefined) data.type = type;
  if (rules !== undefined) data.rules = rules;
  if (startsAt !== undefined) data.startsAt = new Date(startsAt);
  if (endsAt !== undefined) data.endsAt = new Date(endsAt);
  if (active !== undefined) data.active = active;
  const updated = await prisma.campaign.update({ where: { id }, data, include: { coupons: true } });
  reply.send(updated);
}

async function activate(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
  const now = new Date();
  if (campaign.startsAt > now || campaign.endsAt < now) return reply.code(400).send({ error: 'campaign not in active window' });
  const updated = await prisma.campaign.update({ where: { id }, data: { active: true } });
  reply.send(updated);
}

async function deactivate(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
  const updated = await prisma.campaign.update({ where: { id }, data: { active: false } });
  reply.send(updated);
}

async function remove(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
  await prisma.$transaction(async (tx) => {
    await tx.coupon.deleteMany({ where: { campaignId: id } });
    await tx.campaign.delete({ where: { id } });
  });
  reply.send({ ok: true });
}

module.exports = {
  list,
  getById,
  create,
  update,
  activate,
  deactivate,
  remove
};
