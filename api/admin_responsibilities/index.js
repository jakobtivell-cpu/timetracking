const getDb = require('../_shared/db');

module.exports = async function (context, req) {
  try {
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
  } catch (err) {
    context.log(err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to load responsibilities' }
    };
  }
};
