const sql = require('mssql');
const getDb = require('../_shared/db');

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

    // Soft-delete: set CancelledAtUtc instead of DELETE
    const r = await db.request()
      .input('TimeEntryId', sql.BigInt, timeEntryId)
      .query(
        `UPDATE dbo.TimeEntry
         SET
           CancelledAtUtc = SYSUTCDATETIME(),
           UpdatedAtUtc   = SYSUTCDATETIME()
         WHERE TimeEntryId = @TimeEntryId
           AND EndTimeUtc IS NULL
           AND CancelledAtUtc IS NULL;

         SELECT @@ROWCOUNT AS RowsCancelled;`
      );

    const rowsCancelled = Number(r.recordset?.[0]?.RowsCancelled || 0);

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true, rowsCancelled }
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
