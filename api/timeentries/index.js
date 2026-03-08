const sql = require('mssql');
const getDb = require('../_shared/db');
const { getSchema, durationCol } = require('../_shared/db');

function badRequest(context, msg){
  context.res = {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
    body: { error: msg, code: 'BAD_REQUEST' }
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
    const schema = await getSchema(db);
    const s = schema.timeEntry;
    const durCol = durationCol(schema);

    // Build SELECT columns dynamically based on schema
    const baseCols = [
      'te.TimeEntryId', 'te.CustomerId', 'te.TaskId', 't.TaskName',
      'te.StartTimeUtc', 'te.EndTimeUtc',
      s.hasDurationSeconds
        ? `te.${durCol} AS DurationSec`
        : `(te.${durCol} * 60) AS DurationSec`,
      'te.RatePerHour', 'te.CostAmount'
    ];

    if (s.hasCurrencyCode)    baseCols.push('te.CurrencyCode');
    if (s.hasConsultantName)  baseCols.push('te.ConsultantName');
    baseCols.push('ctr.ResponsibleName');

    // Build WHERE filters
    const cancelFilter = s.hasCancelledAtUtc ? 'AND te.CancelledAtUtc IS NULL' : '';
    const consultantFilter = s.hasConsultantName
      ? 'AND (@Consultant IS NULL OR te.ConsultantName = @Consultant)'
      : '';

    function mapRow(x) {
      const row = {
        timeEntryId:     Number(x.TimeEntryId),
        customerId:      Number(x.CustomerId),
        taskId:          Number(x.TaskId),
        taskName:        x.TaskName,
        startTimeUtc:    x.StartTimeUtc,
        endTimeUtc:      x.EndTimeUtc,
        durationSeconds: x.DurationSec,    // always in seconds (normalized)
        ratePerHour:     x.RatePerHour,
        costAmount:      x.CostAmount,
        currencyCode:    x.CurrencyCode || 'SEK',
        consultantName:  x.ConsultantName || null,
        responsibleName: x.ResponsibleName || null
      };
      if (x.DurationSecondsSoFar !== undefined) row.durationSecondsSoFar = x.DurationSecondsSoFar;
      if (x.CostAmountSoFar !== undefined) row.costAmountSoFar = x.CostAmountSoFar;
      return row;
    }

    if (runningOnly) {
      // Add live-computed fields for running entries
      const runCols = [...baseCols,
        "DATEDIFF(SECOND, te.StartTimeUtc, SYSUTCDATETIME()) AS DurationSecondsSoFar",
        "ROUND(te.RatePerHour * (DATEDIFF(SECOND, te.StartTimeUtc, SYSUTCDATETIME()) / 3600.0), 2) AS CostAmountSoFar"
      ];

      const r = await db.request()
        .input('CustomerId', sql.Int, customerId)
        .input('Consultant', sql.NVarChar(200), consultant)
        .query(
          `SELECT ${runCols.join(', ')}
           FROM dbo.TimeEntry te
           JOIN dbo.Task t ON t.TaskId = te.TaskId
           LEFT JOIN dbo.CustomerTaskResponsible ctr
             ON ctr.CustomerId = te.CustomerId AND ctr.TaskId = te.TaskId AND ctr.IsActive = 1
           WHERE te.CustomerId = @CustomerId
             AND te.EndTimeUtc IS NULL
             ${cancelFilter}
             ${consultantFilter}
           ORDER BY te.StartTimeUtc DESC;`
        );

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: (r.recordset || []).map(mapRow)
      };
      return;
    }

    // Date-range listing
    const r = await db.request()
      .input('CustomerId', sql.Int, customerId)
      .input('From', sql.DateTime2, (from && !isNaN(from)) ? from : null)
      .input('To', sql.DateTime2, (to && !isNaN(to)) ? to : null)
      .input('Consultant', sql.NVarChar(200), consultant)
      .input('Limit', sql.Int, limit)
      .input('Offset', sql.Int, offset)
      .query(
        `SELECT ${baseCols.join(', ')}
         FROM dbo.TimeEntry te
         JOIN dbo.Task t ON t.TaskId = te.TaskId
         LEFT JOIN dbo.CustomerTaskResponsible ctr
           ON ctr.CustomerId = te.CustomerId AND ctr.TaskId = te.TaskId AND ctr.IsActive = 1
         WHERE te.CustomerId = @CustomerId
           ${cancelFilter}
           AND (@From IS NULL OR te.StartTimeUtc >= @From)
           AND (@To IS NULL OR te.StartTimeUtc < @To)
           ${consultantFilter}
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
