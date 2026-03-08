const getDb = require('../_shared/db');

module.exports = async function (context, req) {
  try {
    const db = await getDb();

    let rows;
    try {
      // Try with CurrencyCode first (new schema)
      const r = await db.request().query(
        `SELECT CustomerId, CustomerName, CurrencyCode, IsActive
         FROM dbo.Customer
         WHERE IsActive = 1
         ORDER BY CustomerName ASC;`
      );
      rows = r.recordset || [];
    } catch (e1) {
      // Fall back to without CurrencyCode (old schema)
      context.log('CurrencyCode column not found, falling back:', e1.message);
      const r = await db.request().query(
        `SELECT CustomerId, CustomerName, IsActive
         FROM dbo.Customer
         WHERE IsActive = 1
         ORDER BY CustomerName ASC;`
      );
      rows = r.recordset || [];
    }

    const customers = rows.map(x => ({
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
    context.log('customers endpoint fatal error:', err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to load customers', detail: err.message || String(err) }
    };
  }
};
