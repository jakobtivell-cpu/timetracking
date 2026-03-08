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

/**
 * Schema detection — cached per process lifetime.
 * Checks which optional columns exist so queries adapt to old/new schemas.
 */
let _schema;
async function getSchema(db) {
  if (_schema) return _schema;
  _schema = {
    customer: { hasCurrencyCode: false },
    timeEntry: {
      hasConsultantName: false,
      hasCurrencyCode: false,
      hasCancelledAtUtc: false,
      hasDurationSeconds: false,
      hasDurationMinutes: false
    }
  };
  try {
    const r = await db.request().query(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME IN ('Customer','TimeEntry')
        AND COLUMN_NAME IN ('CurrencyCode','ConsultantName','CancelledAtUtc','DurationSeconds','DurationMinutes');
    `);
    for (const row of (r.recordset || [])) {
      const t = row.TABLE_NAME;
      const c = row.COLUMN_NAME;
      if (t === 'Customer' && c === 'CurrencyCode') _schema.customer.hasCurrencyCode = true;
      if (t === 'TimeEntry' && c === 'ConsultantName') _schema.timeEntry.hasConsultantName = true;
      if (t === 'TimeEntry' && c === 'CurrencyCode') _schema.timeEntry.hasCurrencyCode = true;
      if (t === 'TimeEntry' && c === 'CancelledAtUtc') _schema.timeEntry.hasCancelledAtUtc = true;
      if (t === 'TimeEntry' && c === 'DurationSeconds') _schema.timeEntry.hasDurationSeconds = true;
      if (t === 'TimeEntry' && c === 'DurationMinutes') _schema.timeEntry.hasDurationMinutes = true;
    }
  } catch { /* proceed with defaults */ }
  return _schema;
}

/** Column name for duration — adapts to old (DurationMinutes) or new (DurationSeconds) schema */
function durationCol(schema) {
  if (schema.timeEntry.hasDurationSeconds) return 'DurationSeconds';
  if (schema.timeEntry.hasDurationMinutes) return 'DurationMinutes';
  return 'DurationSeconds'; // new schema default
}

/** Whether to use SECOND or MINUTE for DATEDIFF when computing duration */
function durationUnit(schema) {
  return schema.timeEntry.hasDurationSeconds || !schema.timeEntry.hasDurationMinutes ? 'SECOND' : 'MINUTE';
}

module.exports = getDb;
module.exports.getDb = getDb;
module.exports.withTransaction = withTransaction;
module.exports.getSchema = getSchema;
module.exports.durationCol = durationCol;
module.exports.durationUnit = durationUnit;
module.exports.sql = sql;
