import { getTursoClient } from "./turso";
import { SCHEMA_STATEMENTS } from "./schema";

async function main() {
  const client = getTursoClient();

  for (const stmt of SCHEMA_STATEMENTS) {
    const label = stmt.split("\n")[0].slice(0, 80);
    try {
      await client.execute(stmt);
      console.log(`  ok  ${label}`);
    } catch (err) {
      console.error(`  fail ${label}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  console.log("\nMigration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
