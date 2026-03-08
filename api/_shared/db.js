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
 * Uses COL_LENGTH() which is known to work on this Azure SQL instance.
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
      SELECT
        COL_LENGTH('dbo.Customer','CurrencyCode')    AS C_Currency,
        COL_LENGTH('dbo.TimeEntry','ConsultantName')  AS TE_Consultant,
        COL_LENGTH('dbo.TimeEntry','CurrencyCode')    AS TE_Currency,
        COL_LENGTH('dbo.TimeEntry','CancelledAtUtc')  AS TE_Cancelled,
        COL_LENGTH('dbo.TimeEntry','DurationSeconds')  AS TE_DurSec,
        COL_LENGTH('dbo.TimeEntry','DurationMinutes')  AS TE_DurMin;
    `);
    const row = r.recordset?.[0];
    if (row) {
      _schema.customer.hasCurrencyCode        = row.C_Currency   != null;
      _schema.timeEntry.hasConsultantName      = row.TE_Consultant != null;
      _schema.timeEntry.hasCurrencyCode        = row.TE_Currency  != null;
      _schema.timeEntry.hasCancelledAtUtc      = row.TE_Cancelled != null;
      _schema.timeEntry.hasDurationSeconds     = row.TE_DurSec   != null;
      _schema.timeEntry.hasDurationMinutes     = row.TE_DurMin   != null;
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
