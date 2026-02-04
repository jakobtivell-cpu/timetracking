const getDb = require('../_shared/db');
module.exports = async function (context, req) {
  const { taskId } = req.body;
  const db = await getDb();
  const r = await db.request()
    .input('TaskId', taskId)
    .query('EXEC dbo.sp_TimeEntry_Start @TaskId=@TaskId');
  context.res.json(r.recordset[0] || { ok:true });
};
