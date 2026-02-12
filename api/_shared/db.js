const sql = require('mssql');

let pool;

module.exports = async () => {
  if (pool) return pool;

  const cfg = {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: true,
      enableArithAbort: true
    }
  };

  pool = await sql.connect(cfg);
  return pool;
};
