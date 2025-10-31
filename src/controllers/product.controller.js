const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseIntOrDefault(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function list(request, reply) {
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 20);
  const search = request.query.q || null;
  const category = request.query.category || null;
  const storeId = request.query.storeId || null;
  const where = { storeId: storeId || undefined, status: 'ACTIVE' };
  if (search) where.OR = [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }];
  if (category) where.categories = { some: { categoryId: category } };
  const products = await prisma.product.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { publishedAt: 'desc' },
    include: { variants: { take: 1 }, media: true }
  });
  const total = await prisma.product.count({ where });
  reply.send({ data: products, meta: { page, perPage, total } });
}

async function getById(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: { include: { attributes: { include: { value: true, attribute: true } }, inventory: true, media: true } },
      categories: { include: { category: true } },
      collections: { include: { collection: true } },
      media: true,
      specs: true
    }
  });
  if (!product) return reply.code(404).send({ error: 'product not found' });
  reply.send(product);
}

async function getBySlug(request, reply) {
  const { slug } = request.params || {};
  const storeId = request.query.storeId || null;
  if (!slug) return reply.code(400).send({ error: 'slug required' });
  const product = await prisma.product.findFirst({
    where: { slug, storeId: storeId || undefined },
    include: {
      variants: { include: { attributes: { include: { value: true, attribute: true } }, inventory: true, media: true } },
      categories: { include: { category: true } },
      media: true,
      specs: true
    }
  });
  if (!product) return reply.code(404).send({ error: 'product not found' });
  reply.send(product);
}

async function listVariants(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'product id required' });
  const variants = await prisma.productVariant.findMany({
    where: { productId: id },
    include: { attributes: { include: { value: true, attribute: true } }, inventory: { include: { warehouse: true } }, media: true }
  });
  reply.send(variants);
}

async function related(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const prodCats = await prisma.productCategory.findMany({ where: { productId: id }, select: { categoryId: true } });
  if (!prodCats.length) return reply.send([]);
  const categoryIds = prodCats.map(c => c.categoryId);
  const related = await prisma.product.findMany({
    where: { categories: { some: { categoryId: { in: categoryIds } } }, id: { not: id }, status: 'ACTIVE' },
    take: 10,
    include: { media: true, variants: { take: 1 } }
  });
  reply.send(related);
}

async function recommendations(request, reply) {
  const { id } = request.params || {};
  const userId = request.user && request.user.sub;
  if (!id) return reply.code(400).send({ error: 'id required' });
  const recent = await prisma.interaction.findMany({
    where: { userId: userId || undefined },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { productId: true, type: true }
  });
  const popular = await prisma.interaction.groupBy({
    by: ['productId'],
    where: { productId: { not: null } },
    _count: { productId: true },
    orderBy: { _count: { productId: 'desc' } },
    take: 10
  });
  const recommendedIds = [...new Set(popular.map(p => p.productId).filter(pid => pid !== id))].slice(0, 10);
  const products = await prisma.product.findMany({ where: { id: { in: recommendedIds } }, include: { media: true, variants: { take: 1 } } });
  reply.send(products);
}

async function search(request, reply) {
  const q = request.query.q || '';
  const storeId = request.query.storeId || null;
  const page = parseIntOrDefault(request.query.page, 1);
  const perPage = parseIntOrDefault(request.query.perPage, 20);
  if (!q) return reply.code(400).send({ error: 'q required' });
  const where = { storeId: storeId || undefined, OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] };
  const items = await prisma.product.findMany({
    where,
    skip: (page - 1) * perPage,
    take: perPage,
    include: { variants: { take: 1 }, media: true }
  });
  const total = await prisma.product.count({ where });
  reply.send({ data: items, meta: { page, perPage, total } });
}

async function create(request, reply) {
  const userId = request.user && request.user.sub;
  const body = request.body || {};
  const { storeId, title, description, slug, skuBase, status, categories, specs, media, variants, customData } = body;
  if (!storeId || !title || !slug) return reply.code(400).send({ error: 'storeId, title and slug required' });
  const existing = await prisma.product.findFirst({ where: { storeId, slug } });
  if (existing) return reply.code(409).send({ error: 'slug already exists' });
  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        storeId,
        title,
        description: description || null,
        slug,
        skuBase: skuBase || null,
        status: status || 'DRAFT',
        specs: specs || [],
        customData: customData || null,
        media: (media || []).map(m => ({ url: m.url, type: m.type || 'IMAGE', altText: m.altText || null, meta: m.meta || null, storeId }))
      },
      include: { media: true }
    });
    if (Array.isArray(categories)) {
      for (const cId of categories) {
        await tx.productCategory.create({ data: { productId: p.id, categoryId: cId } });
      }
    }
    if (Array.isArray(variants)) {
      for (const v of variants) {
        const createdV = await tx.productVariant.create({
          data: {
            productId: p.id,
            sku: v.sku,
            title: v.title || null,
            barcode: v.barcode || null,
            price: v.price || 0,
            compareAt: v.compareAt || null,
            weightKg: v.weightKg || null,
            dimensions: v.dimensions || null,
            customData: v.customData || null
          }
        });
        if (Array.isArray(v.attributes)) {
          for (const a of v.attributes) {
            await tx.variantAttribute.create({ data: { variantId: createdV.id, attributeId: a.attributeId, valueId: a.valueId } });
          }
        }
        if (Array.isArray(v.media)) {
          for (const m of v.media) {
            await tx.media.create({ data: { storeId, productId: p.id, url: m.url, type: m.type || 'IMAGE', altText: m.altText || null, meta: m.meta || null } });
          }
        }
      }
    }
    return p;
  });
  reply.code(201).send(created);
}

async function update(request, reply) {
  const { id } = request.params || {};
  const body = request.body || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: 'product not found' });
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.slug !== undefined) data.slug = body.slug;
  if (body.status !== undefined) data.status = body.status;
  if (body.skuBase !== undefined) data.skuBase = body.skuBase;
  if (body.customData !== undefined) data.customData = body.customData;
  if (body.specs !== undefined) data.specs = body.specs;
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.product.update({ where: { id }, data, include: { media: true } });
    if (Array.isArray(body.categories)) {
      await tx.productCategory.deleteMany({ where: { productId: id } });
      for (const cId of body.categories) {
        await tx.productCategory.create({ data: { productId: id, categoryId: cId } });
      }
    }
    if (Array.isArray(body.media)) {
      for (const m of body.media) {
        if (m.id) {
          await tx.media.update({ where: { id: m.id }, data: { url: m.url, altText: m.altText || null, meta: m.meta || null } });
        } else {
          await tx.media.create({ data: { storeId: p.storeId, productId: id, url: m.url, type: m.type || 'IMAGE', altText: m.altText || null, meta: m.meta || null } });
        }
      }
    }
    return p;
  });
  reply.send(updated);
}

async function remove(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  await prisma.$transaction(async (tx) => {
    await tx.productCategory.deleteMany({ where: { productId: id } });
    await tx.collectionProduct.deleteMany({ where: { productId: id } });
    await tx.productVariant.deleteMany({ where: { productId: id } });
    await tx.media.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });
  reply.send({ ok: true });
}

async function publish(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const now = new Date();
  const product = await prisma.product.update({ where: { id }, data: { status: 'ACTIVE', publishedAt: now } });
  reply.send(product);
}

async function unpublish(request, reply) {
  const { id } = request.params || {};
  if (!id) return reply.code(400).send({ error: 'id required' });
  const product = await prisma.product.update({ where: { id }, data: { status: 'DRAFT', publishedAt: null } });
  reply.send(product);
}

module.exports = {
  list,
  getById,
  getBySlug,
  listVariants,
  related,
  recommendations,
  search,
  create,
  update,
  remove,
  publish,
  unpublish
};
