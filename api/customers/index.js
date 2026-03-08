const getDb = require('../_shared/db');
const { getSchema } = require('../_shared/db');

module.exports = async function (context, req) {
  try {
    const db = await getDb();
    const schema = await getSchema(db);

    const cols = ['CustomerId', 'CustomerName', 'IsActive'];
    if (schema.customer.hasCurrencyCode) cols.push('CurrencyCode');

    const r = await db.request().query(
      `SELECT ${cols.join(', ')}
       FROM dbo.Customer
       WHERE IsActive = 1
       ORDER BY CustomerName ASC;`
    );

    const customers = (r.recordset || []).map(x => ({
      customerId: Number(x.CustomerId),
      customerName: x.CustomerName,
      currencyCode: x.CurrencyCode || 'SEK',
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
