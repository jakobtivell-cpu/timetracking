const sql = require('mssql');

const pool = new sql.ConnectionPool({
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: { encrypt: true }
});

let poolPromise;

module.exports = async function () {
  if (!poolPromise) poolPromise = pool.connect();
  return poolPromise;
};
