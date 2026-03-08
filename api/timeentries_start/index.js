const sql = require('mssql');
const getDb = require('../_shared/db');
const { withTransaction, getSchema, durationCol, durationUnit } = require('../_shared/db');

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
    const customerId = Number(body.customerId);
    const taskId = Number(body.taskId);
    const consultantName = (body.consultantName || '').trim() || null;

    if(!customerId) return badRequest(context, 'customerId is required');
    if(!taskId) return badRequest(context, 'taskId is required');

    const db = await getDb();
    const schema = await getSchema(db);
    const s = schema.timeEntry;
    const durCol = durationCol(schema);
    const durUnit = durationUnit(schema);

    // Get rate (and currency if available)
    const metaCols = ['t.DefaultRatePerHour'];
    if (schema.customer.hasCurrencyCode) metaCols.push('c.CurrencyCode');

    const rMeta = await db.request()
      .input('TaskId', sql.Int, taskId)
      .input('CustomerId', sql.Int, customerId)
      .query(
        `SELECT ${metaCols.join(', ')}
         FROM dbo.Task t
         CROSS JOIN dbo.Customer c
         WHERE t.TaskId = @TaskId AND c.CustomerId = @CustomerId;`
      );

    const meta = rMeta.recordset?.[0];
    if(!meta) return badRequest(context, 'Unknown taskId or customerId');

    const rate = meta.DefaultRatePerHour;
    const currency = meta.CurrencyCode || 'SEK';

    // Use a transaction: auto-stop any running entry, then insert new one
    const result = await withTransaction(async (tx) => {
      // 1. Auto-stop any running entry for this consultant
      if(s.hasConsultantName && consultantName){
        const cancelFilter = s.hasCancelledAtUtc ? 'AND CancelledAtUtc IS NULL' : '';
        await tx.request()
          .input('ConsultantName', sql.NVarChar(200), consultantName)
          .query(
            `DECLARE @StopTime DATETIME2(0) = SYSUTCDATETIME();

             UPDATE dbo.TimeEntry
             SET
               EndTimeUtc   = @StopTime,
               ${durCol}    = DATEDIFF(${durUnit}, StartTimeUtc, @StopTime),
               CostAmount   = ROUND(RatePerHour * (DATEDIFF(SECOND, StartTimeUtc, @StopTime) / 3600.0), 2),
               UpdatedAtUtc = SYSUTCDATETIME()
             WHERE ConsultantName = @ConsultantName
               AND EndTimeUtc IS NULL
               ${cancelFilter};`
          );
      }

      // 2. Build INSERT columns and values dynamically
      const cols = ['CustomerId', 'TaskId', 'StartTimeUtc', 'EndTimeUtc',
                    durCol, 'RatePerHour', 'CostAmount', 'CreatedAtUtc', 'UpdatedAtUtc'];
      const vals = ['@CustomerId', '@TaskId', '@Now', 'NULL',
                    'NULL', '@RatePerHour', 'NULL', 'SYSUTCDATETIME()', 'SYSUTCDATETIME()'];

      const request = tx.request()
        .input('CustomerId', sql.Int, customerId)
        .input('TaskId', sql.Int, taskId)
        .input('RatePerHour', sql.Decimal(19,4), rate);

      if (s.hasCurrencyCode) {
        cols.push('CurrencyCode');
        vals.push('@CurrencyCode');
        request.input('CurrencyCode', sql.Char(3), currency);
      }

      if (s.hasConsultantName) {
        cols.push('ConsultantName');
        vals.push('@ConsultantName');
        request.input('ConsultantName', sql.NVarChar(200), consultantName);
      }

      const r = await request.query(
        `DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();

         INSERT INTO dbo.TimeEntry (${cols.join(', ')})
         VALUES (${vals.join(', ')});

         SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS TimeEntryId, @Now AS StartTimeUtc;`
      );

      return r.recordset?.[0] || {};
    });

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        timeEntryId: Number(result.TimeEntryId),
        startTimeUtc: result.StartTimeUtc
      }
    };
  } catch (err) {
    context.log(err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to start time entry' }
    };
  }
};
