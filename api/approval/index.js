const sql = require('mssql');
const getDb = require('../_shared/db');

function badRequest(context, msg){
  context.res = {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
    body: { error: msg, code: 'BAD_REQUEST' }
  };
}

async function handleGet(context, req){
  const customerId = Number(req.query.customerId);
  const periodKey  = (req.query.periodKey || '').trim();

  if(!customerId) return badRequest(context, 'customerId is required');

  const db = await getDb();

  const q = periodKey
    ? `SELECT ApprovalId, CustomerId, PeriodKey, ApprovedBy, ApprovedAtUtc, RevokedAtUtc
       FROM dbo.Approval
       WHERE CustomerId = @CustomerId AND PeriodKey = @PeriodKey;`
    : `SELECT ApprovalId, CustomerId, PeriodKey, ApprovedBy, ApprovedAtUtc, RevokedAtUtc
       FROM dbo.Approval
       WHERE CustomerId = @CustomerId
       ORDER BY PeriodKey DESC;`;

  const r = await db.request()
    .input('CustomerId', sql.Int, customerId)
    .input('PeriodKey', sql.VarChar(7), periodKey || null)
    .query(q);

  const rows = (r.recordset || []).map(x => ({
    approvalId:   Number(x.ApprovalId),
    customerId:   Number(x.CustomerId),
    periodKey:    x.PeriodKey,
    approvedBy:   x.ApprovedBy,
    approvedAtUtc: x.ApprovedAtUtc,
    revokedAtUtc: x.RevokedAtUtc,
    isApproved:   x.RevokedAtUtc === null
  }));

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: periodKey ? (rows[0] || null) : rows
  };
}

async function handlePost(context, req){
  const body = req.body || {};
  const customerId = Number(body.customerId);
  const periodKey  = (body.periodKey || '').trim();
  const approvedBy = (body.approvedBy || '').trim();
  const revoke     = Boolean(body.revoke);

  if(!customerId) return badRequest(context, 'customerId is required');
  if(!periodKey || !/^\d{4}-\d{2}$/.test(periodKey)) return badRequest(context, 'periodKey must be YYYY-MM format');
  if(!approvedBy) return badRequest(context, 'approvedBy is required');

  const db = await getDb();

  if(revoke){
    await db.request()
      .input('CustomerId', sql.Int, customerId)
      .input('PeriodKey', sql.VarChar(7), periodKey)
      .query(
        `UPDATE dbo.Approval
         SET RevokedAtUtc = SYSUTCDATETIME()
         WHERE CustomerId = @CustomerId
           AND PeriodKey = @PeriodKey
           AND RevokedAtUtc IS NULL;`
      );
  } else {
    await db.request()
      .input('CustomerId', sql.Int, customerId)
      .input('PeriodKey', sql.VarChar(7), periodKey)
      .input('ApprovedBy', sql.NVarChar(200), approvedBy)
      .query(
        `MERGE dbo.Approval AS tgt
         USING (SELECT @CustomerId AS CustomerId, @PeriodKey AS PeriodKey) AS src
         ON tgt.CustomerId = src.CustomerId AND tgt.PeriodKey = src.PeriodKey
         WHEN MATCHED THEN
           UPDATE SET ApprovedBy = @ApprovedBy,
                      ApprovedAtUtc = SYSUTCDATETIME(),
                      RevokedAtUtc = NULL
         WHEN NOT MATCHED THEN
           INSERT (CustomerId, PeriodKey, ApprovedBy, ApprovedAtUtc)
           VALUES (@CustomerId, @PeriodKey, @ApprovedBy, SYSUTCDATETIME());`
      );
  }

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { ok: true }
  };
}

module.exports = async function (context, req) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    if(method === 'GET')  return await handleGet(context, req);
    if(method === 'POST') return await handlePost(context, req);

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
      body: { error: 'Failed to handle approval request' }
    };
  }
};
