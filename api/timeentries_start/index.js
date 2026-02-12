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
    const body = req.body || {};
    const customerId = Number(body.customerId);
    const taskId = Number(body.taskId);
    const consultantName = (body.consultantName || '').trim() || null;

    if(!customerId) return badRequest(context, 'customerId is required');
    if(!taskId) return badRequest(context, 'taskId is required');

    const db = await getDb();
    const hasConsultant = await consultantColSupported(db);

    // Get rate from task
    const rRate = await db.request().input('TaskId', sql.Int, taskId)
      .query(`SELECT DefaultRatePerHour FROM dbo.Task WHERE TaskId=@TaskId;`);
    const rate = rRate.recordset?.[0]?.DefaultRatePerHour;
    if(rate === undefined) return badRequest(context, 'Unknown taskId');

    const request = db.request()
      .input('CustomerId', sql.Int, customerId)
      .input('TaskId', sql.Int, taskId)
      .input('RatePerHour', sql.Decimal(10,2), rate);

    if(hasConsultant){
      request.input('ConsultantName', sql.NVarChar(200), consultantName);
    }

    const insertSql = hasConsultant ?
      `DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();

       INSERT INTO dbo.TimeEntry (
         CustomerId,
         TaskId,
         StartTimeUtc,
         EndTimeUtc,
         DurationMinutes,
         RatePerHour,
         CostAmount,
         ConsultantName,
         CreatedAtUtc,
         UpdatedAtUtc
       )
       VALUES (
         @CustomerId,
         @TaskId,
         @Now,
         NULL,
         NULL,
         @RatePerHour,
         NULL,
         @ConsultantName,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       );

       SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS TimeEntryId, @Now AS StartTimeUtc;`
    :
      `DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();

       INSERT INTO dbo.TimeEntry (
         CustomerId,
         TaskId,
         StartTimeUtc,
         EndTimeUtc,
         DurationMinutes,
         RatePerHour,
         CostAmount,
         CreatedAtUtc,
         UpdatedAtUtc
       )
       VALUES (
         @CustomerId,
         @TaskId,
         @Now,
         NULL,
         NULL,
         @RatePerHour,
         NULL,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       );

       SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS TimeEntryId, @Now AS StartTimeUtc;`;

    const r = await request.query(insertSql);
    const row = r.recordset?.[0] || {};

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        timeEntryId: Number(row.TimeEntryId),
        startTimeUtc: row.StartTimeUtc
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
