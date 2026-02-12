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

    const r = await db.request()
      .input('TimeEntryId', sql.BigInt, timeEntryId)
      .query(
        `DECLARE @EndTimeUtc DATETIME2(0) = SYSUTCDATETIME();

         UPDATE dbo.TimeEntry
         SET
           EndTimeUtc = @EndTimeUtc,
           DurationMinutes = DATEDIFF(MINUTE, StartTimeUtc, @EndTimeUtc),
           CostAmount = ROUND(RatePerHour * (DATEDIFF(SECOND, StartTimeUtc, @EndTimeUtc) / 3600.0), 2),
           UpdatedAtUtc = SYSUTCDATETIME()
         WHERE TimeEntryId = @TimeEntryId
           AND EndTimeUtc IS NULL;

         SELECT @@ROWCOUNT AS RowsUpdated;`
      );

    const rowsUpdated = Number(r.recordset?.[0]?.RowsUpdated || 0);

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true, rowsUpdated }
    };
  } catch (err) {
    context.log(err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to stop time entry' }
    };
  }
};
