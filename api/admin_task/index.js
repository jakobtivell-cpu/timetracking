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
    const name = (body.name || '').trim();
    const rate = Number(body.rate);
    const isBillable = body.isBillable !== undefined ? Boolean(body.isBillable) : true;

    if(!name) return badRequest(context, 'name is required');
    if(!Number.isFinite(rate) || rate < 0) return badRequest(context, 'rate must be a non-negative number');

    const db = await getDb();

    await db.request()
      .input('TaskName', sql.NVarChar(200), name)
      .input('Rate', sql.Decimal(19,4), rate)
      .input('IsBillable', sql.Bit, isBillable ? 1 : 0)
      .query(
        `MERGE dbo.Task AS tgt
         USING (SELECT @TaskName AS TaskName) AS src
         ON tgt.TaskName = src.TaskName
         WHEN MATCHED THEN
           UPDATE SET DefaultRatePerHour = @Rate,
                      IsBillable = @IsBillable,
                      IsActive = 1,
                      UpdatedAtUtc = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN
           INSERT (TaskName, DefaultRatePerHour, IsBillable, IsActive, CreatedAtUtc, UpdatedAtUtc)
           VALUES (@TaskName, @Rate, @IsBillable, 1, SYSUTCDATETIME(), SYSUTCDATETIME());`
      );

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true }
    };
  } catch (err) {
    context.log(err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to save task' }
    };
  }
};
