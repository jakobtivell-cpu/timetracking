const sql = require('mssql');
const getDb = require('../_shared/db');
const { getSchema } = require('../_shared/db');

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
    const currencyCode = (body.currencyCode || 'SEK').trim().toUpperCase();

    if(!name) return badRequest(context, 'name is required');
    if(currencyCode.length !== 3) return badRequest(context, 'currencyCode must be a 3-letter ISO code');

    const db = await getDb();
    const schema = await getSchema(db);

    const request = db.request()
      .input('CustomerName', sql.NVarChar(200), name);

    let q;
    if (schema.customer.hasCurrencyCode) {
      request.input('CurrencyCode', sql.Char(3), currencyCode);
      q = `MERGE dbo.Customer AS tgt
           USING (SELECT @CustomerName AS CustomerName) AS src
           ON tgt.CustomerName = src.CustomerName
           WHEN MATCHED THEN
             UPDATE SET CurrencyCode = @CurrencyCode,
                        IsActive = 1,
                        UpdatedAtUtc = SYSUTCDATETIME()
           WHEN NOT MATCHED THEN
             INSERT (CustomerName, CurrencyCode, IsActive, CreatedAtUtc, UpdatedAtUtc)
             VALUES (@CustomerName, @CurrencyCode, 1, SYSUTCDATETIME(), SYSUTCDATETIME());`;
    } else {
      q = `MERGE dbo.Customer AS tgt
           USING (SELECT @CustomerName AS CustomerName) AS src
           ON tgt.CustomerName = src.CustomerName
           WHEN MATCHED THEN
             UPDATE SET IsActive = 1,
                        UpdatedAtUtc = SYSUTCDATETIME()
           WHEN NOT MATCHED THEN
             INSERT (CustomerName, IsActive, CreatedAtUtc, UpdatedAtUtc)
             VALUES (@CustomerName, 1, SYSUTCDATETIME(), SYSUTCDATETIME());`;
    }

    await request.query(q);

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
