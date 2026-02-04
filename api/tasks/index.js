const getDb = require('../_shared/db');
module.exports = async function (context) {
  const db = await getDb();
  const r = await db.request().query(
    'SELECT TaskId, TaskName FROM Task WHERE IsActive=1'
  );
  context.res.json(r.recordset);
};
