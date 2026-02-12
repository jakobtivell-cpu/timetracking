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
    const customerId = Number(body.customerId);
    const taskId = Number(body.taskId);
    const responsible = (body.responsible || '').trim();

    if(!customerId) return badRequest(context, 'customerId is required');
    if(!taskId) return badRequest(context, 'taskId is required');
    if(!responsible) return badRequest(context, 'responsible is required');

    const db = await getDb();

    await db.request()
      .input('CustomerId', sql.Int, customerId)
      .input('TaskId', sql.Int, taskId)
      .input('ResponsibleName', sql.NVarChar(200), responsible)
      .query(
        `MERGE dbo.CustomerTaskResponsible AS tgt
         USING (SELECT @CustomerId AS CustomerId, @TaskId AS TaskId) AS src
         ON tgt.CustomerId = src.CustomerId AND tgt.TaskId = src.TaskId
         WHEN MATCHED THEN
           UPDATE SET ResponsibleName = @ResponsibleName,
                      IsActive = 1,
                      UpdatedAtUtc = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN
           INSERT (CustomerId, TaskId, ResponsibleName, IsActive, CreatedAtUtc, UpdatedAtUtc)
           VALUES (@CustomerId, @TaskId, @ResponsibleName, 1, SYSUTCDATETIME(), SYSUTCDATETIME());`
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
      body: { error: 'Failed to save responsibility' }
    };
  }
};
