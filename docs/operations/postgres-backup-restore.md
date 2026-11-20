# PostgreSQL backup and restore drill

This procedure creates a logical PostgreSQL backup and restores it into a
separate, disposable database. Run it regularly and after changing the database
major version. Never point the drill restore URL at the production database.

## Create and verify a backup

Use a protected shell with `DIRECT_DATABASE_URL` loaded from the secret store.
Store backups outside the repository on encrypted storage with restricted access.

```sh
umask 077
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/flowfret-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-acl \
  --file="$BACKUP_FILE" "$DIRECT_DATABASE_URL"
pg_restore --list "$BACKUP_FILE" >/dev/null
```

Keep the backup file name and checksum in the backup inventory. Do not put
connection strings, cookies, or key material in that inventory.

## Restore into a disposable database

Create a new empty database with the same PostgreSQL major version as the
source. Set `RESTORE_DATABASE_URL` to that database only. The database name
should include `restore_drill`; verify its host and name before continuing.

```sh
printf 'Restore target: %s\n' "${RESTORE_DATABASE_URL%%\?*}"
pg_restore --no-owner --no-acl --exit-on-error \
  --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"
```

After restoring, verify the migration inventory and representative row counts,
then start the application against the disposable database and check its health
endpoint and a read-only GraphQL query. Record the backup timestamp, restore
duration, checks performed, and any errors. Remove the disposable database
through the database provider after the drill; retain the backup according to
the project's retention policy.

Database backups do not contain Cloudinary media, model weights, environment
secrets, or YouTube cookies. Keep those assets in their respective storage or
secret-management systems and test their recovery separately.
