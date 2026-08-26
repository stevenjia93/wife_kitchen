const fs = require("fs/promises");
const path = require("path");
const { Client } = require("pg");
const { connectionOptions, databaseSslOptions } = require("../server/database");

async function main() {
  const client = new Client({ ...connectionOptions(), ssl: databaseSslOptions() });
  const migrationsDir = path.join(__dirname, "..", "server", "migrations");
  const migrationFiles = (await fs.readdir(migrationsDir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  await client.connect();
  try {
    for (const file of migrationFiles) {
      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      console.log(`Applied ${file}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
