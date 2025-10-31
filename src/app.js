const fs = require('fs');
const path = require('path');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const rateLimit = require('@fastify/rate-limit');
const jwt = require('@fastify/jwt');
const routes = require('./routes');
const config = require('./config');
const logger = require('./config/logger');

const certPath = path.join(__dirname, '../certs');
const httpsOptions = {
  key: fs.readFileSync(path.join(certPath, 'key.pem')),
  cert: fs.readFileSync(path.join(certPath, 'cert.pem'))
};

const app = Fastify({
  logger,
  https: httpsOptions
});

app.register(cors, { origin: true, credentials: true });
app.register(helmet);
app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
app.register(jwt, { secret: config.jwtSecret });
app.register(routes, { prefix: '/v1' });

app.register(async (fastify, opts) => {
  fastify.get('/', async (request, reply) => {
    return { status: true };
  });
}, { });


module.exports = app;
