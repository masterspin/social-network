import { migrate } from "drizzle-orm/neon-http/migrator";
import { loadScriptEnv } from "./load-env";

loadScriptEnv();

async function main() {
  const { db } = await import("../lib/db");
  await migrate(db, { migrationsFolder: "./drizzle" });
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
