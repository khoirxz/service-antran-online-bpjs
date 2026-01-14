import mysql from "mysql2/promise";

export const khanzaDb = mysql.createPool({
  host: process.env.KHANZA_DB_HOST,
  user: process.env.KHANZA_DB_USER,
  password: process.env.KHANZA_DB_PASSWORD,
  database: process.env.KHANZA_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
