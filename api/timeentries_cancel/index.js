const sql = require('mssql');
const getDb = require('../_shared/db');
const { getSchema } = require('../_shared/db');

function badRequest(context, msg){
  context.res = {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
    body: { error: msg, code: 'BAD_REQUEST' }
  };
}

module.exports = async function (context, req) {
  try {
    const body = req.body || {};
    const timeEntryId = Number(body.timeEntryId);
    if(!timeEntryId) return badRequest(context, 'timeEntryId is required');

    const db = await getDb();
    const schema = await getSchema(db);

    let rowsAffected = 0;

    if (schema.timeEntry.hasCancelledAtUtc) {
      // New schema: soft-delete
      const r = await db.request()
        .input('TimeEntryId', sql.BigInt, timeEntryId)
        .query(
          `UPDATE dbo.TimeEntry
           SET CancelledAtUtc = SYSUTCDATETIME(),
               UpdatedAtUtc   = SYSUTCDATETIME()
           WHERE TimeEntryId = @TimeEntryId
             AND EndTimeUtc IS NULL
             AND CancelledAtUtc IS NULL;
           SELECT @@ROWCOUNT AS Rows;`
        );
      rowsAffected = Number(r.recordset?.[0]?.Rows || 0);
    } else {
      // Old schema: hard delete (no CancelledAtUtc column)
      const r = await db.request()
        .input('TimeEntryId', sql.BigInt, timeEntryId)
        .query(
          `DELETE FROM dbo.TimeEntry
           WHERE TimeEntryId = @TimeEntryId
             AND EndTimeUtc IS NULL;
           SELECT @@ROWCOUNT AS Rows;`
        );
      rowsAffected = Number(r.recordset?.[0]?.Rows || 0);
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true, rowsAffected }
    };
  } catch (err) {
    context.log(err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to cancel time entry' }
    };
  }
};
