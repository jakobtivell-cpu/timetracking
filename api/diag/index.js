const getDb = require('../_shared/db');
const { getSchema } = require('../_shared/db');

module.exports = async function (context, req) {
  const results = { schema: null, tables: {}, tests: {} };

  try {
    const db = await getDb();
    results.connection = 'ok';

    // Schema detection
    try {
      const schema = await getSchema(db);
      results.schema = schema;
    } catch (e) {
      results.schema = { error: e.message };
    }

    // List all tables
    try {
      const r = await db.request().query(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' ORDER BY TABLE_NAME;"
      );
      results.tables.list = (r.recordset || []).map(x => x.TABLE_NAME);
    } catch (e) {
      results.tables.list = { error: e.message };
    }

    // Column check on each key table
    for (const tbl of ['Customer', 'Task', 'TimeEntry', 'CustomerTaskResponsible', 'Approval']) {
      try {
        const r = await db.request().query(
          `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='${tbl}' ORDER BY ORDINAL_POSITION;`
        );
        results.tables[tbl] = (r.recordset || []).map(x => `${x.COLUMN_NAME} (${x.DATA_TYPE})`);
      } catch (e) {
        results.tables[tbl] = { error: e.message };
      }
    }

    // Test queries
    try {
      const r = await db.request().query("SELECT COUNT(*) AS N FROM dbo.Customer;");
      results.tests.customerCount = r.recordset?.[0]?.N;
    } catch (e) { results.tests.customerCount = { error: e.message }; }

    try {
      const r = await db.request().query("SELECT COUNT(*) AS N FROM dbo.Task;");
      results.tests.taskCount = r.recordset?.[0]?.N;
    } catch (e) { results.tests.taskCount = { error: e.message }; }

    try {
      const r = await db.request().query("SELECT COUNT(*) AS N FROM dbo.TimeEntry;");
      results.tests.timeEntryCount = r.recordset?.[0]?.N;
    } catch (e) { results.tests.timeEntryCount = { error: e.message }; }

    try {
      const r = await db.request().query("SELECT COUNT(*) AS N FROM dbo.CustomerTaskResponsible;");
      results.tests.responsibilityCount = r.recordset?.[0]?.N;
    } catch (e) { results.tests.responsibilityCount = { error: e.message }; }

  } catch (e) {
    results.connection = { error: e.message };
  }

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: results
  };
};
