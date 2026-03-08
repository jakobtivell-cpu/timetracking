const sql = require('mssql');
const getDb = require('../_shared/db');

function badRequest(context, msg){
  context.res = {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
    body: { error: msg, code: 'BAD_REQUEST' }
  };
}

function mapRow(x){
  return {
    timeEntryId:        Number(x.TimeEntryId),
    customerId:         Number(x.CustomerId),
    taskId:             Number(x.TaskId),
    taskName:           x.TaskName,
    startTimeUtc:       x.StartTimeUtc,
    endTimeUtc:         x.EndTimeUtc,
    durationSeconds:    x.DurationSeconds,
    ratePerHour:        x.RatePerHour,
    costAmount:         x.CostAmount,
    currencyCode:       x.CurrencyCode,
    consultantName:     x.ConsultantName,
    responsibleName:    x.ResponsibleName,
    // Running-entry fields (only present when running=1)
    costAmountSoFar:    x.CostAmountSoFar !== undefined ? x.CostAmountSoFar : undefined,
    durationSecondsSoFar: x.DurationSecondsSoFar !== undefined ? x.DurationSecondsSoFar : undefined
  };
}

module.exports = async function (context, req) {
  try {
    const customerId = Number(req.query.customerId);
    if(!customerId) return badRequest(context, 'customerId is required');

    const runningOnly = String(req.query.running || '') === '1';
    const consultant  = (req.query.consultant || '').trim() || null;
    const limit       = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 5000);
    const offset      = Math.max(Number(req.query.offset) || 0, 0);

    const fromStr = req.query.from;
    const toStr   = req.query.to;
    const from    = fromStr ? new Date(fromStr) : null;
    const to      = toStr   ? new Date(toStr)   : null;

    const db = await getDb();

    if(runningOnly){
      const r = await db.request()
        .input('CustomerId', sql.Int, customerId)
        .input('Consultant', sql.NVarChar(200), consultant)
        .query(
          `SELECT
              te.TimeEntryId, te.CustomerId, te.TaskId, t.TaskName,
              te.StartTimeUtc, te.EndTimeUtc, te.DurationSeconds,
              te.RatePerHour, te.CostAmount, te.CurrencyCode,
              te.ConsultantName, ctr.ResponsibleName,
              DATEDIFF(SECOND, te.StartTimeUtc, SYSUTCDATETIME()) AS DurationSecondsSoFar,
              ROUND(te.RatePerHour * (DATEDIFF(SECOND, te.StartTimeUtc, SYSUTCDATETIME()) / 3600.0), 2) AS CostAmountSoFar
            FROM dbo.TimeEntry te
            JOIN dbo.Task t ON t.TaskId = te.TaskId
            LEFT JOIN dbo.CustomerTaskResponsible ctr
              ON ctr.CustomerId = te.CustomerId AND ctr.TaskId = te.TaskId AND ctr.IsActive = 1
            WHERE te.CustomerId = @CustomerId
              AND te.EndTimeUtc IS NULL
              AND te.CancelledAtUtc IS NULL
              AND (@Consultant IS NULL OR te.ConsultantName = @Consultant)
            ORDER BY te.StartTimeUtc DESC;`
        );

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: (r.recordset || []).map(mapRow)
      };
      return;
    }

    // Date-range listing — excludes cancelled entries
    const r = await db.request()
      .input('CustomerId', sql.Int, customerId)
      .input('From', sql.DateTime2, (from && !isNaN(from)) ? from : null)
      .input('To', sql.DateTime2, (to && !isNaN(to)) ? to : null)
      .input('Consultant', sql.NVarChar(200), consultant)
      .input('Limit', sql.Int, limit)
      .input('Offset', sql.Int, offset)
      .query(
        `SELECT
            te.TimeEntryId, te.CustomerId, te.TaskId, t.TaskName,
            te.StartTimeUtc, te.EndTimeUtc, te.DurationSeconds,
            te.RatePerHour, te.CostAmount, te.CurrencyCode,
            te.ConsultantName, ctr.ResponsibleName
          FROM dbo.TimeEntry te
          JOIN dbo.Task t ON t.TaskId = te.TaskId
          LEFT JOIN dbo.CustomerTaskResponsible ctr
            ON ctr.CustomerId = te.CustomerId AND ctr.TaskId = te.TaskId AND ctr.IsActive = 1
          WHERE te.CustomerId = @CustomerId
            AND te.CancelledAtUtc IS NULL
            AND (@From IS NULL OR te.StartTimeUtc >= @From)
            AND (@To IS NULL OR te.StartTimeUtc < @To)
            AND (@Consultant IS NULL OR te.ConsultantName = @Consultant)
          ORDER BY te.StartTimeUtc DESC
          OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;`
      );

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: (r.recordset || []).map(mapRow)
    };
  } catch (err) {
    context.log(err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to load time entries' }
    };
  }
};
