const getDb = require('../_shared/db');
module.exports = async function (context, req) {
  const { timeEntryId } = req.body;
  const db = await getDb();
  await db.request()
    .input('TimeEntryId', timeEntryId)
    .query('EXEC dbo.sp_TimeEntry_StopNow @TimeEntryId=@TimeEntryId');
  context.res.json({ ok:true });
};
