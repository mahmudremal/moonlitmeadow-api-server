// const fp = require('fastify-plugin');
// const fastifySession = require('fastify-session');
// const RedisStore = require('connect-redis');
// const redisClient = require('../lib/redisClient');

// module.exports = fp(async function (fastify, opts) {
//   const store = new RedisStore({
//     client: redisClient,
//     prefix: 'sess:',
//   });

//   fastify.register(fastifySession, {
//     secret: process.env.SESSION_SECRET || 'session-secret-change-me',
//     cookie: {
//       secure: process.env.NODE_ENV === 'production',
//       maxAge: 1000 * 60 * 60 * 24,
//     },
//     store,
//     saveUninitialized: false,
//   });
// });
