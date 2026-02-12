const getDb = require('../_shared/db');

module.exports = async function (context, req) {
  try {
    const db = await getDb();
    const r = await db.request().query(
      `SELECT CustomerId, CustomerName, IsActive
       FROM dbo.Customer
       WHERE IsActive = 1
       ORDER BY CustomerName ASC;`
    );

    const customers = (r.recordset || []).map(x => ({
      customerId: Number(x.CustomerId),
      customerName: x.CustomerName,
      isActive: x.IsActive === null ? true : Boolean(x.IsActive)
    }));

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: customers
    };
  } catch (err) {
    context.log(err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to load customers' }
    };
  }
};
