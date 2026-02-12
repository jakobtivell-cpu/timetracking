const sql = require('mssql');
const getDb = require('../_shared/db');

let _consultantSupported;

async function consultantColSupported(db){
  if(_consultantSupported !== undefined) return _consultantSupported;
  try{
    const r = await db.request().query("SELECT COL_LENGTH('dbo.TimeEntry','ConsultantName') AS Len;");
    _consultantSupported = r.recordset?.[0]?.Len !== null && r.recordset?.[0]?.Len !== undefined;
  }catch{
    _consultantSupported = false;
  }
  return _consultantSupported;
}

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
    const consultant = (req.query.consultant || '').trim();

    const fromStr = req.query.from;
    const toStr = req.query.to;
    const from = fromStr ? new Date(fromStr) : null;
    const to = toStr ? new Date(toStr) : null;

    const db = await getDb();
    const hasConsultant = await consultantColSupported(db);

    if(runningOnly){
      const q = hasConsultant ?
        `SELECT
            te.TimeEntryId,
            te.CustomerId,
            te.TaskId,
            t.TaskName,
            te.StartTimeUtc,
            te.EndTimeUtc,
            te.DurationMinutes,
            te.RatePerHour,
            te.CostAmount,
            te.ConsultantName,
            ctr.ResponsibleName,
            DATEDIFF(SECOND, te.StartTimeUtc, SYSUTCDATETIME()) AS DurationSecondsSoFar,
            ROUND(te.RatePerHour * (DATEDIFF(SECOND, te.StartTimeUtc, SYSUTCDATETIME()) / 3600.0), 2) AS CostAmountSoFar
          FROM dbo.TimeEntry te
          JOIN dbo.Task t ON t.TaskId = te.TaskId
          LEFT JOIN dbo.CustomerTaskResponsible ctr
            ON ctr.CustomerId = te.CustomerId AND ctr.TaskId = te.TaskId AND ctr.IsActive = 1
          WHERE te.CustomerId = @CustomerId
            AND te.EndTimeUtc IS NULL
            AND (@Consultant IS NULL OR te.ConsultantName = @Consultant)
          ORDER BY te.StartTimeUtc DESC;`
      :
        `SELECT
            te.TimeEntryId,
            te.CustomerId,
            te.TaskId,
            t.TaskName,
            te.StartTimeUtc,
            te.EndTimeUtc,
            te.DurationMinutes,
            te.RatePerHour,
            te.CostAmount,
            CAST(NULL AS NVARCHAR(200)) AS ConsultantName,
            ctr.ResponsibleName,
            DATEDIFF(SECOND, te.StartTimeUtc, SYSUTCDATETIME()) AS DurationSecondsSoFar,
            ROUND(te.RatePerHour * (DATEDIFF(SECOND, te.StartTimeUtc, SYSUTCDATETIME()) / 3600.0), 2) AS CostAmountSoFar
          FROM dbo.TimeEntry te
          JOIN dbo.Task t ON t.TaskId = te.TaskId
          LEFT JOIN dbo.CustomerTaskResponsible ctr
            ON ctr.CustomerId = te.CustomerId AND ctr.TaskId = te.TaskId AND ctr.IsActive = 1
          WHERE te.CustomerId = @CustomerId
            AND te.EndTimeUtc IS NULL
          ORDER BY te.StartTimeUtc DESC;`;

      const r = await db.request()
        .input('CustomerId', sql.Int, customerId)
        .input('Consultant', sql.NVarChar(200), hasConsultant ? (consultant || null) : null)
        .query(q);

      const rows = (r.recordset || []).map(x=>({
        timeEntryId: Number(x.TimeEntryId),
        customerId: Number(x.CustomerId),
        taskId: Number(x.TaskId),
        taskName: x.TaskName,
        startTimeUtc: x.StartTimeUtc,
        endTimeUtc: x.EndTimeUtc,
        durationMinutes: x.DurationMinutes,
        ratePerHour: x.RatePerHour,
        costAmount: x.CostAmount,
        costAmountSoFar: x.CostAmountSoFar,
        durationSecondsSoFar: x.DurationSecondsSoFar,
        consultantName: x.ConsultantName,
        responsibleName: x.ResponsibleName
      }));

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: rows
      };
      return;
    }

    // Date-range listing (ended + any started within range)
    const q = hasConsultant ?
      `SELECT
          te.TimeEntryId,
          te.CustomerId,
          te.TaskId,
          t.TaskName,
          te.StartTimeUtc,
          te.EndTimeUtc,
          te.DurationMinutes,
          te.RatePerHour,
          te.CostAmount,
          te.ConsultantName,
          ctr.ResponsibleName
        FROM dbo.TimeEntry te
        JOIN dbo.Task t ON t.TaskId = te.TaskId
        LEFT JOIN dbo.CustomerTaskResponsible ctr
          ON ctr.CustomerId = te.CustomerId AND ctr.TaskId = te.TaskId AND ctr.IsActive = 1
        WHERE te.CustomerId = @CustomerId
          AND (@From IS NULL OR te.StartTimeUtc >= @From)
          AND (@To IS NULL OR te.StartTimeUtc < @To)
          AND (@Consultant IS NULL OR te.ConsultantName = @Consultant)
        ORDER BY te.StartTimeUtc DESC;`
    :
      `SELECT
          te.TimeEntryId,
          te.CustomerId,
          te.TaskId,
          t.TaskName,
          te.StartTimeUtc,
          te.EndTimeUtc,
          te.DurationMinutes,
          te.RatePerHour,
          te.CostAmount,
          CAST(NULL AS NVARCHAR(200)) AS ConsultantName,
          ctr.ResponsibleName
        FROM dbo.TimeEntry te
        JOIN dbo.Task t ON t.TaskId = te.TaskId
        LEFT JOIN dbo.CustomerTaskResponsible ctr
          ON ctr.CustomerId = te.CustomerId AND ctr.TaskId = te.TaskId AND ctr.IsActive = 1
        WHERE te.CustomerId = @CustomerId
          AND (@From IS NULL OR te.StartTimeUtc >= @From)
          AND (@To IS NULL OR te.StartTimeUtc < @To)
        ORDER BY te.StartTimeUtc DESC;`;

    const r = await db.request()
      .input('CustomerId', sql.Int, customerId)
      .input('From', sql.DateTime2, (from && !isNaN(from)) ? from : null)
      .input('To', sql.DateTime2, (to && !isNaN(to)) ? to : null)
      .input('Consultant', sql.NVarChar(200), hasConsultant ? (consultant || null) : null)
      .query(q);

    const rows = (r.recordset || []).map(x=>({
      timeEntryId: Number(x.TimeEntryId),
      customerId: Number(x.CustomerId),
      taskId: Number(x.TaskId),
      taskName: x.TaskName,
      startTimeUtc: x.StartTimeUtc,
      endTimeUtc: x.EndTimeUtc,
      durationMinutes: x.DurationMinutes,
      ratePerHour: x.RatePerHour,
      costAmount: x.CostAmount,
      consultantName: x.ConsultantName,
      responsibleName: x.ResponsibleName
    }));

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: rows
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
