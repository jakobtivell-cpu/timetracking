const sql = require('mssql');
const getDb = require('../_shared/db');
const { getSchema, durationCol, durationUnit } = require('../_shared/db');

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
    const durCol = durationCol(schema);
    const durUnit = durationUnit(schema);
    const cancelFilter = schema.timeEntry.hasCancelledAtUtc ? 'AND CancelledAtUtc IS NULL' : '';

    const r = await db.request()
      .input('TimeEntryId', sql.BigInt, timeEntryId)
      .query(
        `DECLARE @EndTimeUtc DATETIME2(0) = SYSUTCDATETIME();

         UPDATE dbo.TimeEntry
         SET
           EndTimeUtc   = @EndTimeUtc,
           ${durCol}    = DATEDIFF(${durUnit}, StartTimeUtc, @EndTimeUtc),
           CostAmount   = ROUND(RatePerHour * (DATEDIFF(SECOND, StartTimeUtc, @EndTimeUtc) / 3600.0), 2),
           UpdatedAtUtc = SYSUTCDATETIME()
         WHERE TimeEntryId = @TimeEntryId
           AND EndTimeUtc IS NULL
           ${cancelFilter};

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
