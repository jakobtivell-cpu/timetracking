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
    if(!name) return badRequest(context, 'name is required');

    const db = await getDb();

    await db.request()
      .input('CustomerName', sql.NVarChar(200), name)
      .query(
        `MERGE dbo.Customer AS tgt
         USING (SELECT @CustomerName AS CustomerName) AS src
         ON tgt.CustomerName = src.CustomerName
         WHEN MATCHED THEN
           UPDATE SET IsActive = 1, UpdatedAtUtc = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN
           INSERT (CustomerName, IsActive, CreatedAtUtc, UpdatedAtUtc)
           VALUES (@CustomerName, 1, SYSUTCDATETIME(), SYSUTCDATETIME());`
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
      body: { error: 'Failed to save customer' }
    };
  }
};
