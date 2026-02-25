const sql = require('mssql');
const getDb = require('../_shared/db');

function badRequest(context, msg){
  context.res = {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
    body: { error: msg, code: 'BAD_REQUEST' }
  };
}

async function handleGet(context){
  const db = await getDb();
  const r = await db.request().query(
    `SELECT
       c.CustomerName,
       t.TaskName,
       ctr.ResponsibleName,
       ctr.IsActive
     FROM dbo.CustomerTaskResponsible ctr
     JOIN dbo.Customer c ON c.CustomerId = ctr.CustomerId
     JOIN dbo.Task t ON t.TaskId = ctr.TaskId
     WHERE ctr.IsActive = 1
     ORDER BY c.CustomerName, t.TaskName;`
  );

  const rows = (r.recordset || []).map(x => ({
    customerName: x.CustomerName,
    taskName: x.TaskName,
    responsibleName: x.ResponsibleName,
    isActive: x.IsActive === null ? true : Boolean(x.IsActive)
  }));

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: rows
  };
}

async function handlePost(context, req){
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
}

module.exports = async function (context, req) {
  try {
    const method = (req.method || 'GET').toUpperCase();

    if(method === 'GET'){
      return await handleGet(context);
    }

    if(method === 'POST'){
      return await handlePost(context, req);
    }

    context.res = {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Method not allowed' }
    };
  } catch (err) {
    context.log(err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to handle responsibility request' }
    };
  }
};
