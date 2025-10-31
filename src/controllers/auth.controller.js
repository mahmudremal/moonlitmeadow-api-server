const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'replace_this_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'replace_refresh_secret';
const ACCESS_EXPIRES_IN = process.env.ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_DAYS = parseInt(process.env.REFRESH_EXPIRES_DAYS || '30', 10);

function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

function signRefreshToken(sessionId) {
  const expiresInSeconds = REFRESH_EXPIRES_DAYS * 24 * 60 * 60;
  return jwt.sign({ sessionId }, REFRESH_SECRET, { expiresIn: expiresInSeconds });
}

async function createSession({ userId, ip, userAgent }) {
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  return prisma.session.create({
    data: {
      userId,
      expiresAt,
      meta: { ip, userAgent },
    },
  });
}

async function register(request, reply) {
  const { email, password, name, tenantId } = request.body || {};
  if (!email || !password) return reply.code(400).send({ error: 'email and password required' });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return reply.code(409).send({ error: 'email already registered' });
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      password: hash,
      name,
      tenantId: tenantId || null,
    },
  });
  const roles = [];
  const accessToken = signAccessToken({ sub: user.id, roles });
  const session = await createSession({ userId: user.id, ip: request.ip, userAgent: request.headers['user-agent'] || null });
  const refreshToken = signRefreshToken(session.id);
  reply.code(201).send({ user: { id: user.id, email: user.email, name: user.name }, accessToken, refreshToken, expiresIn: ACCESS_EXPIRES_IN });
}

async function login(request, reply) {
  const { email, password } = request.body || {};
  if (!email || !password) return reply.code(400).send({ error: 'email and password required' });
  const user = await prisma.user.findUnique({ where: { email }, include: { roles: { include: { role: true } } } });
  if (!user) return reply.code(401).send({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return reply.code(401).send({ error: 'invalid credentials' });
  const roles = (user.roles || []).map(r => r.role.name);
  const accessToken = signAccessToken({ sub: user.id, roles });
  const session = await createSession({ userId: user.id, ip: request.ip, userAgent: request.headers['user-agent'] || null });
  const refreshToken = signRefreshToken(session.id);
  reply.send({ user: { id: user.id, email: user.email, name: user.name }, accessToken, refreshToken, expiresIn: ACCESS_EXPIRES_IN });
}

async function refresh(request, reply) {
  const { refreshToken } = request.body || {};
  if (!refreshToken) return reply.code(400).send({ error: 'refreshToken required' });
  let payload;
  try {
    payload = jwt.verify(refreshToken, REFRESH_SECRET);
  } catch (err) {
    return reply.code(401).send({ error: 'invalid refresh token' });
  }
  const session = await prisma.session.findUnique({ where: { id: payload.sessionId }, include: { user: { include: { roles: { include: { role: true } } } } } });
  if (!session) return reply.code(401).send({ error: 'session not found' });
  if (session.expiresAt < new Date()) return reply.code(401).send({ error: 'session expired' });
  const roles = (session.user.roles || []).map(r => r.role.name);
  const accessToken = signAccessToken({ sub: session.userId, roles });
  const newSession = await prisma.session.update({ where: { id: session.id }, data: { meta: { ...session.meta, refreshedAt: new Date() } } });
  const newRefreshToken = signRefreshToken(newSession.id);
  reply.send({ accessToken, refreshToken: newRefreshToken, expiresIn: ACCESS_EXPIRES_IN });
}

async function logout(request, reply) {
  const { refreshToken } = request.body || {};
  if (!refreshToken) return reply.code(400).send({ error: 'refreshToken required' });
  let payload;
  try {
    payload = jwt.verify(refreshToken, REFRESH_SECRET);
  } catch (err) {
    return reply.code(200).send({ ok: true });
  }
  await prisma.session.deleteMany({ where: { id: payload.sessionId } });
  reply.send({ ok: true });
}

async function me(request, reply) {
  const authHeader = request.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return reply.code(401).send({ error: 'missing token' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return reply.code(401).send({ error: 'invalid token' });
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, tenantId: true, roles: { include: { role: true } } },
  });
  if (!user) return reply.code(404).send({ error: 'user not found' });
  const roles = (user.roles || []).map(r => r.role.name);
  reply.send({ id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, roles });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
};
