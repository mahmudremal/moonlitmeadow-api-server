const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function create(request, reply) {
  const { email, password, name, tenantId } = request.body || {};
  if (!email || !password) return reply.code(400).send({ error: 'email and password required' });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return reply.code(409).send({ error: 'email already registered' });
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password: hash, name: name || null, tenantId: tenantId || null },
    select: { id: true, email: true, name: true, tenantId: true, createdAt: true }
  });
  reply.code(201).send(user);
}

async function me(request, reply) {
  const userId = request.user && request.user.sub;
  if (!userId) return reply.code(401).send({ error: 'unauthenticated' });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, tenantId: true, roles: { include: { role: true } }, createdAt: true, updatedAt: true }
  });
  if (!user) return reply.code(404).send({ error: 'user not found' });
  const roles = (user.roles || []).map(r => r.role.name);
  reply.send({ id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, roles, createdAt: user.createdAt, updatedAt: user.updatedAt });
}

async function updateMe(request, reply) {
  const userId = request.user && request.user.sub;
  if (!userId) return reply.code(401).send({ error: 'unauthenticated' });
  const { name, password } = request.body || {};
  const data = {};
  if (name !== undefined) data.name = name;
  if (password) data.password = await bcrypt.hash(password, 12);
  const user = await prisma.user.update({ where: { id: userId }, data, select: { id: true, email: true, name: true, tenantId: true, updatedAt: true } });
  reply.send(user);
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, tenantId: true, roles: { include: { role: true } }, createdAt: true, updatedAt: true }
  });
  if (!user) return reply.code(404).send({ error: 'user not found' });
  const roles = (user.roles || []).map(r => r.role.name);
  reply.send({ id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, roles, createdAt: user.createdAt, updatedAt: user.updatedAt });
}

async function update(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const { name, password, tenantId } = request.body || {};
  const data = {};
  if (name !== undefined) data.name = name;
  if (password) data.password = await bcrypt.hash(password, 12);
  if (tenantId !== undefined) data.tenantId = tenantId;
  const user = await prisma.user.update({ where: { id }, data, select: { id: true, email: true, name: true, tenantId: true, updatedAt: true } });
  reply.send(user);
}

async function remove(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  await prisma.user.delete({ where: { id } });
  reply.send({ ok: true });
}

async function assignRole(request, reply) {
  const { id } = request.params || {};
  const { roleId, scope } = request.body || {};
  if (!id || !roleId) return reply.code(400).send({ error: 'user id and roleId required' });
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return reply.code(404).send({ error: 'role not found' });
  const assignment = await prisma.roleAssignment.create({ data: { userId: id, roleId, scope: scope || null } });
  reply.code(201).send(assignment);
}

async function revokeRole(request, reply) {
  const { id, roleId } = request.params || {};
  if (!id || !roleId) return reply.code(400).send({ error: 'user id and roleId required' });
  await prisma.roleAssignment.deleteMany({ where: { userId: id, roleId } });
  reply.send({ ok: true });
}

module.exports = {
  create,
  me,
  updateMe,
  getById,
  update,
  remove,
  assignRole,
  revokeRole
};
