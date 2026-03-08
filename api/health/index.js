const getDb = require('../_shared/db');

module.exports = async function (context, req) {
  const checks = { api: 'ok', database: 'unknown' };
  let status = 200;

  try {
    const db = await getDb();
    const r = await db.request().query('SELECT 1 AS Ping;');
    checks.database = r.recordset?.[0]?.Ping === 1 ? 'ok' : 'error';
  } catch (err) {
    checks.database = 'error';
    status = 503;
  }

  context.res = {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: {
      status: status === 200 ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString()
    }
  };
};
