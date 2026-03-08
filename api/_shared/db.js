const sql = require('mssql');

let pool;

async function getDb() {
  if (pool) return pool;

  const cfg = {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: true,
      enableArithAbort: true,
      connectTimeout: 15000,
      requestTimeout: 15000
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  pool = await sql.connect(cfg);
  return pool;
}

/**
 * Run a callback inside a SQL transaction.
 * Usage: await withTransaction(async (tx) => { await tx.request()... })
 */
async function withTransaction(fn) {
  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = getDb;
module.exports.getDb = getDb;
module.exports.withTransaction = withTransaction;
module.exports.sql = sql;
