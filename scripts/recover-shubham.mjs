// One-shot, idempotent recovery for the original Shubham profile (user_id
// "sam") from a user-supplied JSON export. RIYA's row is never touched.
//
// Behaviour:
//   1. Loads DATABASE_URL from .env.local.
//   2. Confirms `sam` exists in `users`. Aborts if not.
//   3. Reads the recovery marker from `app_state`. If present, exits.
//   4. Snapshots Sam's current row into `app_state` so the old value is
//      always recoverable.
//   5. Records the exact byte length of every other user's user_state row
//      and re-checks it after writing. If anything other than Sam's row
//      changed, the script throws.
//   6. Writes the backup JSON into `sam`'s user_state row.
//   7. Records a recovery marker so this can never run again.
//
// Run with:
//   node scripts/recover-shubham.mjs
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(here, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  let value = m[2];
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!process.env[m[1]]) process.env[m[1]] = value;
}

const TARGET_USER_ID = "sam";
const BACKUP_FILE = resolve(
  here,
  "..",
  "json exports",
  "gym-tracker-2026-05-18.json"
);
const MARKER_ID = "recovery:shubham-2026-05-18";
const SNAPSHOT_ID = "snapshot:sam-pre-recovery-2026-05-18";

const sql = neon(process.env.DATABASE_URL);

async function main() {
  const backup = JSON.parse(readFileSync(BACKUP_FILE, "utf8"));
  if (
    !backup ||
    typeof backup !== "object" ||
    !backup.settings ||
    !backup.workoutLogs ||
    !backup.foodLogs ||
    !backup.weightLogs
  ) {
    throw new Error(
      `Backup file ${BACKUP_FILE} is missing required AppState fields.`
    );
  }

  const users = await sql`SELECT id, name FROM users`;
  console.log(
    "Users found:",
    users.map((u) => `${u.id}=${u.name}`).join(", ")
  );
  const target = users.find((u) => u.id === TARGET_USER_ID);
  if (!target) {
    throw new Error(
      `Target user '${TARGET_USER_ID}' not found. Aborting — refusing to create or delete users.`
    );
  }

  const markerRows = await sql`
    SELECT 1 FROM app_state WHERE id = ${MARKER_ID}
  `;
  if (markerRows.length > 0) {
    console.log(
      `Recovery marker '${MARKER_ID}' already present. Nothing to do — exiting.`
    );
    return;
  }

  // Snapshot every other user's row size so we can confirm we did not
  // touch them.
  const otherSizes = await sql`
    SELECT user_id, pg_column_size(data) AS bytes
    FROM user_state
    WHERE user_id <> ${TARGET_USER_ID}
    ORDER BY user_id
  `;
  console.log("Other-user row sizes BEFORE:", otherSizes);

  // Snapshot Sam's current state so the old value is always recoverable.
  const cur = await sql`
    SELECT data FROM user_state WHERE user_id = ${TARGET_USER_ID}
  `;
  const snapshot = {
    snapshotAt: new Date().toISOString(),
    userId: TARGET_USER_ID,
    prevData: cur[0]?.data ?? null,
  };
  await sql`
    INSERT INTO app_state (id, data)
    VALUES (${SNAPSHOT_ID}, ${JSON.stringify(snapshot)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data, updated_at = now()
  `;
  console.log(`Snapshot stored at app_state.id='${SNAPSHOT_ID}'.`);

  // Write the backup into Sam's row only.
  await sql`
    INSERT INTO user_state (user_id, data, updated_at)
    VALUES (${TARGET_USER_ID}, ${JSON.stringify(backup)}::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE SET
      data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
  `;
  console.log(`Restored backup into user_state row for '${TARGET_USER_ID}'.`);

  // Verify no other user's row was touched.
  const otherSizesAfter = await sql`
    SELECT user_id, pg_column_size(data) AS bytes
    FROM user_state
    WHERE user_id <> ${TARGET_USER_ID}
    ORDER BY user_id
  `;
  const before = new Map(otherSizes.map((r) => [r.user_id, r.bytes]));
  const after = new Map(otherSizesAfter.map((r) => [r.user_id, r.bytes]));
  if (
    before.size !== after.size ||
    [...before.entries()].some(([k, v]) => after.get(k) !== v)
  ) {
    throw new Error(
      `Detected a change in another user's row size. Aborting and throwing — investigate immediately.`
    );
  }
  console.log("Other-user row sizes AFTER (should match BEFORE):", otherSizesAfter);

  // Record marker so this script can never run again.
  await sql`
    INSERT INTO app_state (id, data)
    VALUES (
      ${MARKER_ID},
      ${JSON.stringify({
        ranAt: new Date().toISOString(),
        sourceFile: "json exports/gym-tracker-2026-05-18.json",
        targetUserId: TARGET_USER_ID,
        snapshotId: SNAPSHOT_ID,
      })}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data, updated_at = now()
  `;
  console.log(`Recovery marker '${MARKER_ID}' set. Recovery complete.`);
}

main().catch((err) => {
  console.error("RECOVERY FAILED:", err);
  process.exit(1);
});
