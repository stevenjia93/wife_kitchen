const { Client } = require("pg");
const { connectionOptions, databaseSslOptions } = require("../server/database");

async function main() {
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("迁移需要 SUPABASE_URL 和 SUPABASE_SECRET_KEY");
  }

  const [households, states] = await Promise.all([
    supabaseGet(supabaseUrl, serviceKey, "/rest/v1/households?select=id,code,created_at&limit=10000"),
    supabaseGet(supabaseUrl, serviceKey, "/rest/v1/household_states?select=household_id,payload,updated_at&limit=10000")
  ]);

  const client = new Client({ ...connectionOptions(), ssl: databaseSslOptions() });
  await client.connect();
  try {
    await client.query("begin");
    for (const household of households) {
      await client.query(
        `insert into households (id, code, created_at)
         values ($1, $2, $3)
         on conflict (id) do update set code = excluded.code`,
        [household.id, household.code, household.created_at || new Date()]
      );
    }
    for (const state of states) {
      await client.query(
        `insert into household_states (household_id, payload, updated_at)
         values ($1, $2::jsonb, $3)
         on conflict (household_id) do update
           set payload = excluded.payload,
               updated_at = excluded.updated_at`,
        [state.household_id, JSON.stringify(state.payload || {}), state.updated_at || new Date()]
      );
    }
    await client.query("commit");
    console.log(`Imported ${households.length} households and ${states.length} states`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function supabaseGet(baseUrl, serviceKey, path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      apikey: serviceKey,
      ...(serviceKey.startsWith("sb_secret_") ? {} : { authorization: `Bearer ${serviceKey}` })
    }
  });
  if (!response.ok) throw new Error(`Supabase export failed: ${response.status}`);
  return response.json();
}

function normalizeSupabaseUrl(value) {
  const url = String(value || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(url) ? url : "";
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
