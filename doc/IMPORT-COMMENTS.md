# Importing missing issue comments from another Paperclip DB

If your comments were saved in a **different** Paperclip data directory (e.g. when you ran the app from another folder or without `PAPERCLIP_CONFIG`), you can copy those comments into your current DB.

## 1. Find other Paperclip data directories

Run this from your Mac to list likely locations:

```bash
# Default instance
ls -la ~/.paperclip/instances/default/db/PG_VERSION 2>/dev/null && echo "Found: ~/.paperclip/instances/default/db"

# Repo-local (if you ever ran from a repo that had .paperclip)
find /Users/andrewmcculloch -name "PG_VERSION" -path "*/.paperclip/*" -path "*/db/*" 2>/dev/null | head -20

# Common alternate locations
for dir in ~/.paperclip/instances/default/db \
           /Users/andrewmcculloch/paperclip-fork/data/pglite \
           /Users/andrewmcculloch/paperclip-fork/.paperclip/instances/default/db \
           /Users/andrewmcculloch/paperclips/.paperclip/instances/default/db; do
  [ -f "$dir/PG_VERSION" ] && echo "Found: $dir"
done
```

Note the path that has `PG_VERSION` and is **not** your current DB. Your current one is:

`/Users/andrewmcculloch/.paperclip/instances/default/db`

So the “source” (where the missing comments live) might be a different path from the list above.

## 2. Run the import script

**Requirements:**

- Your **current** Paperclip server (the fork) must be **running** so the current DB is up on port 54329.
- Port **54330** must be free (the script starts the source DB on that port temporarily).

Install deps (if you haven’t) and run from the **server** directory:

```bash
cd /Users/andrewmcculloch/paperclip-fork
pnpm install

cd server
# Replace SOURCE_DB_PATH with the path you found (the other instance's db directory)
SOURCE_DB_PATH="/path/to/other/instance/db" node scripts/import-issue-comments.mjs
```

Example if the other DB is in the fork’s repo-local data:

```bash
cd /Users/andrewmcculloch/paperclip-fork/server
SOURCE_DB_PATH="../data/pglite" node scripts/import-issue-comments.mjs
```

Example if the other DB is in another clone:

```bash
cd /Users/andrewmcculloch/paperclip-fork/server
SOURCE_DB_PATH="/Users/andrewmcculloch/paperclips/.paperclip/instances/default/db" node scripts/import-issue-comments.mjs
```

**What the script does:**

- Starts embedded Postgres on `SOURCE_DB_PATH` on port 54330.
- Connects to that DB (source) and to your current DB (port 54329).
- Matches issues by `(company_id, identifier)` (e.g. KCH-30).
- Copies `issue_comments` from source into the current DB for those issues, with new IDs so existing comments are not overwritten.
- Stops the temporary Postgres.

After it finishes, refresh the issue in the UI; the imported comments should appear.

## 3. If you don’t find another DB

If the search in step 1 only shows your current DB, the missing comments may have been in that same DB but from an older run (e.g. before a reset). In that case there is no second copy to import from; use the pinned startup from AGENTS.md so all new comments stay in one place.
