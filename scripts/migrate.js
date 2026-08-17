const fs = require("fs/promises");
const path = require("path");
const { Client } = require("pg");
const { connectionOptions, databaseSslOptions } = require("../server/database");

async function main() {
  const client = new Client({ ...connectionOptions(), ssl: databaseSslOptions() });
  const sql = await fs.readFile(path.join(__dirname, "..", "server", "migrations", "001_domestic_postgres.sql"), "utf8");
  await client.connect();
  try {
    await client.query(sql);
    console.log("Database migration completed");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
