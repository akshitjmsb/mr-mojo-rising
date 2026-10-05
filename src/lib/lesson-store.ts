import { LESSON_SCHEMA } from "./lesson-schema";
import { getTursoClient } from "./turso";

let initialized: Promise<void> | undefined;
export function ensureLessons() {
  initialized ??= (async () => {
    for (const sql of LESSON_SCHEMA) await getTursoClient().execute(sql);
  })().catch(error => { initialized = undefined; throw error; });
  return initialized;
}
