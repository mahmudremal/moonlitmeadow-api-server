const app = require('./app');
const config = require('./config');

const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`HTTPS server listening on https://localhost:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
