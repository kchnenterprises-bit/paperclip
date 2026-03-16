#!/usr/bin/env node
/**
 * Import issue_comments from another Paperclip embedded DB into the current one.
 *
 * Prerequisites:
 * - Current Paperclip server must be running (so current DB is on 54329).
 * - Port 54330 must be free.
 *
 * Usage (from server/):
 *   SOURCE_DB_PATH=/path/to/other/instance/db node scripts/import-issue-comments.mjs
 *
 * Optional:
 *   CURRENT_DATABASE_URL=postgres://paperclip:paperclip@127.0.0.1:54329/paperclip
 */

const path = await import("node:path");
const { existsSync } = await import("node:fs");

const SOURCE_DB_PATH = process.env.SOURCE_DB_PATH;
const CURRENT_DATABASE_URL =
  process.env.CURRENT_DATABASE_URL || "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip";
const SOURCE_PORT = 54330;

if (!SOURCE_DB_PATH?.trim()) {
  console.error("Set SOURCE_DB_PATH to the other instance's db directory (e.g. /path/to/.paperclip/instances/default/db)");
  process.exit(1);
}

const resolvedSourcePath = path.resolve(SOURCE_DB_PATH);
if (!existsSync(path.join(resolvedSourcePath, "PG_VERSION"))) {
  console.error("SOURCE_DB_PATH does not look like a Postgres data directory (no PG_VERSION):", resolvedSourcePath);
  process.exit(1);
}

console.log("Source DB path:", resolvedSourcePath);
console.log("Current DB URL: (port 54329)");
console.log("Source will be started on port", SOURCE_PORT);

const { default: EmbeddedPostgres } = await import("embedded-postgres");
const postgres = (await import("postgres")).default;

let embedded = null;

try {
  embedded = new EmbeddedPostgres({
    databaseDir: resolvedSourcePath,
    user: "paperclip",
    password: "paperclip",
    port: SOURCE_PORT,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: (msg) => {},
    onError: (msg) => console.error("[embedded-postgres]", msg),
  });

  const clusterVersionFile = path.join(resolvedSourcePath, "PG_VERSION");
  if (!existsSync(clusterVersionFile)) {
    console.error("Source directory not initialized. Run the other Paperclip instance at least once.");
    process.exit(1);
  }

  console.log("Starting source Postgres on port", SOURCE_PORT, "...");
  await embedded.start();
  const sourceUrl = `postgres://paperclip:paperclip@127.0.0.1:${SOURCE_PORT}/paperclip`;

  const sqlCurrent = postgres(CURRENT_DATABASE_URL);
  const sqlSource = postgres(sourceUrl);

  // Load issues from both DBs: (company_id, identifier) -> issue id
  const currentIssues = await sqlCurrent`
    SELECT id, company_id, identifier FROM issues WHERE identifier IS NOT NULL
  `;
  const currentByCompanyIdentifier = new Map();
  for (const row of currentIssues) {
    const key = `${row.company_id}::${row.identifier}`;
    currentByCompanyIdentifier.set(key, row.id);
  }

  const sourceIssues = await sqlSource`
    SELECT id, company_id, identifier FROM issues WHERE identifier IS NOT NULL
  `;
  const sourceToCurrentIssueId = new Map();
  for (const row of sourceIssues) {
    const key = `${row.company_id}::${row.identifier}`;
    const currentId = currentByCompanyIdentifier.get(key);
    if (currentId) {
      sourceToCurrentIssueId.set(row.id, currentId);
    }
  }

  console.log("Current issues (with identifier):", currentIssues.length);
  console.log("Source issues (with identifier):", sourceIssues.length);
  console.log("Matched (same company_id + identifier):", sourceToCurrentIssueId.size);

  const sourceComments = await sqlSource`
    SELECT id, company_id, issue_id, author_agent_id, author_user_id, body, created_at, updated_at
    FROM issue_comments
    ORDER BY created_at
  `;

  let inserted = 0;
  let skipped = 0;

  // Dedupe by (issue_id, created_at, body) so we don't double-insert if run twice
  const currentComments = await sqlCurrent`
    SELECT issue_id, created_at, body FROM issue_comments
  `;
  const currentCommentKeys = new Set(
    currentComments.map((r) => `${r.issue_id}::${r.created_at?.toISOString?.() ?? r.created_at}::${r.body?.slice(0, 100)}`)
  );

  for (const c of sourceComments) {
    const currentIssueId = sourceToCurrentIssueId.get(c.issue_id);
    if (!currentIssueId) {
      skipped++;
      continue;
    }
    const key = `${currentIssueId}::${c.created_at?.toISOString?.() ?? c.created_at}::${(c.body || "").slice(0, 100)}`;
    if (currentCommentKeys.has(key)) {
      skipped++;
      continue;
    }
    await sqlCurrent`
      INSERT INTO issue_comments (company_id, issue_id, author_agent_id, author_user_id, body, created_at, updated_at)
      VALUES (${c.company_id}, ${currentIssueId}, ${c.author_agent_id}, ${c.author_user_id}, ${c.body}, ${c.created_at}, ${c.updated_at})
    `;
    currentCommentKeys.add(key);
    inserted++;
  }

  console.log("Source comments:", sourceComments.length);
  console.log("Inserted:", inserted);
  console.log("Skipped (no matching issue or already present):", skipped);

  await sqlCurrent.end();
  await sqlSource.end();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  if (embedded) {
    console.log("Stopping source Postgres...");
    await embedded.stop().catch((e) => console.error("Stop error:", e));
  }
}
