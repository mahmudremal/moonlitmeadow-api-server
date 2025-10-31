// const Redis = require('ioredis');
// const config = require('../config');
// const redis = new Redis(config.redisUrl);

// redis.on('error', (err) => {
//   console.error('Redis error', err);
// });

// module.exports = redis;


const redis = {
  store: new Map(),

  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  },

  async set(key, value, mode, ttl) {
    this.store.set(key, value);
    if (mode === 'EX' && typeof ttl === 'number') {
      setTimeout(() => this.store.delete(key), ttl * 1000);
    }
  },

  async del(key) {
    this.store.delete(key);
  },

  on(event, handler) {
    if (event === 'error') {
      // No-op: simulate Redis error listener
    }
  }
};

module.exports = redis;
