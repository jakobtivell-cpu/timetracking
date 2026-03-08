const sql = require('mssql');
const getDb = require('../_shared/db');
const { withTransaction } = require('../_shared/db');

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

    // Get rate + currency before transaction
    const rMeta = await db.request()
      .input('TaskId', sql.Int, taskId)
      .input('CustomerId', sql.Int, customerId)
      .query(
        `SELECT t.DefaultRatePerHour, c.CurrencyCode
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
      if(consultantName){
        await tx.request()
          .input('ConsultantName', sql.NVarChar(200), consultantName)
          .query(
            `DECLARE @StopTime DATETIME2(0) = SYSUTCDATETIME();

             UPDATE dbo.TimeEntry
             SET
               EndTimeUtc      = @StopTime,
               DurationSeconds = DATEDIFF(SECOND, StartTimeUtc, @StopTime),
               CostAmount      = ROUND(RatePerHour * (DATEDIFF(SECOND, StartTimeUtc, @StopTime) / 3600.0), 2),
               UpdatedAtUtc    = SYSUTCDATETIME()
             WHERE ConsultantName = @ConsultantName
               AND EndTimeUtc IS NULL
               AND CancelledAtUtc IS NULL;`
          );
      }

      // 2. Insert new entry
      const r = await tx.request()
        .input('CustomerId', sql.Int, customerId)
        .input('TaskId', sql.Int, taskId)
        .input('RatePerHour', sql.Decimal(19,4), rate)
        .input('CurrencyCode', sql.Char(3), currency)
        .input('ConsultantName', sql.NVarChar(200), consultantName)
        .query(
          `DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();

           INSERT INTO dbo.TimeEntry (
             CustomerId, TaskId, StartTimeUtc, EndTimeUtc,
             DurationSeconds, RatePerHour, CostAmount,
             CurrencyCode, ConsultantName,
             CreatedAtUtc, UpdatedAtUtc
           )
           VALUES (
             @CustomerId, @TaskId, @Now, NULL,
             NULL, @RatePerHour, NULL,
             @CurrencyCode, @ConsultantName,
             SYSUTCDATETIME(), SYSUTCDATETIME()
           );

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
