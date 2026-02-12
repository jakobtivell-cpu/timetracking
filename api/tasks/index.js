const sql = require('mssql');
const getDb = require('../_shared/db');

module.exports = async function (context, req) {
  try {
    const db = await getDb();

    const r = await db.request().query(
      `SELECT TaskId, TaskName, DefaultRatePerHour, IsBillable, IsActive
       FROM dbo.Task
       WHERE IsActive = 1
       ORDER BY TaskName ASC;`
    );

    const tasks = (r.recordset || []).map(x => ({
      taskId: Number(x.TaskId),
      taskName: x.TaskName,
      defaultRatePerHour: x.DefaultRatePerHour,
      isBillable: x.IsBillable === null ? true : Boolean(x.IsBillable),
      isActive: x.IsActive === null ? true : Boolean(x.IsActive)
    }));

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: tasks
    };
  } catch (err) {
    context.log(err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to load tasks' }
    };
  }
};
