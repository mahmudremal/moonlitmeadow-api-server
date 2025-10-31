const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function list(request, reply) {
  const storeId = request.query.storeId || undefined;
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 50);
  const where = {};
  if (storeId) where.storeId = storeId;
  const items = await prisma.warehouse.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { createdAt: 'desc' }
  });
  const total = await prisma.warehouse.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const wh = await prisma.warehouse.findUnique({
    where: { id },
    include: { stocks: { include: { variant: { include: { product: true } } } } }
  });
  if (!wh) return reply.code(404).send({ error: 'warehouse not found' });
  reply.send(wh);
}

async function create(request, reply) {
  const { storeId, name, code, address } = request.body || {};
  if (!storeId || !name || !code) return reply.code(400).send({ error: 'storeId, name and code required' });
  const exists = await prisma.warehouse.findFirst({ where: { OR: [{ code }, { AND: [{ storeId }, { name }] }] } });
  if (exists) return reply.code(409).send({ error: 'warehouse code or name already exists' });
  const created = await prisma.warehouse.create({
    data: { storeId, name, code, address: address || null }
  });
  reply.code(201).send(created);
}

async function update(request, reply) {
  const { id } = request.params || {};
  const { name, code, address } = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'warehouse not found' });
  if (code && code !== existing.code) {
    const conflict = await prisma.warehouse.findFirst({ where: { code } });
    if (conflict) return reply.code(409).send({ error: 'warehouse code already exists' });
  }
  const data = {};
  if (name !== undefined) data.name = name;
  if (code !== undefined) data.code = code;
  if (address !== undefined) data.address = address;
  const updated = await prisma.warehouse.update({ where: { id }, data });
  reply.send(updated);
}

async function remove(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const wh = await prisma.warehouse.findUnique({ where: { id }, include: { stocks: true } });
  if (!wh) return reply.code(404).send({ error: 'warehouse not found' });
  if (wh.stocks && wh.stocks.length > 0) {
    const totalStock = wh.stocks.reduce((acc, s) => acc + Math.max(0, s.quantity - s.reserved), 0);
    if (totalStock > 0) return reply.code(409).send({ error: 'warehouse has stock; cannot delete' });
  }
  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.deleteMany({ where: { warehouseId: id } });
    await tx.warehouse.delete({ where: { id } });
  });
  reply.send({ ok: true });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove
};
