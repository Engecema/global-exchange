# API gateway persistence

## Supabase database setup

1. In the Supabase dashboard for `global-exchange-dev`, open **SQL Editor**.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) to create the client, movement, and financial transaction tables. Row Level Security is enabled, and no public policies are added; only the server-side API uses its privileged key.
3. Copy `.env.example` to `.env` in this directory and set:
   - `GX_SUPABASE_URL` to the project's base URL (without `/rest/v1`).
   - `GX_SUPABASE_PUBLISHABLE_KEY` to the project's Publishable key.
   - `GX_SUPABASE_SECRET_KEY` to the server-only Secret key. The legacy `service_role` JWT key is also accepted.
   - `GX_ADMIN_EMAILS` to comma-separated administrator email addresses.
4. Never commit `.env` or expose `GX_SUPABASE_SECRET_KEY` in either browser panel.
5. For local panel development, copy `apps/frontend-web/.env.example` to `apps/frontend-web/.env` and set only `GX_SUPABASE_URL` and `GX_SUPABASE_PUBLISHABLE_KEY`. Never put the server-only key in the frontend directory.

## Import existing local data

After the schema is installed and the local `.env` is configured, run from the repository root:

```sh
npm --prefix apps/api-gateway run migrate-data
```

The importer reads `apps/api-gateway/data/gx-data.json`, validates the records, and upserts by record ID. It can be run again safely. Keep a backup of the local JSON until the imported counts and records have been verified in Supabase.

## Render API environment

Configure these values in the Render API service's environment:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `GX_SUPABASE_URL` | Supabase project base URL |
| `GX_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable key |
| `GX_SUPABASE_SECRET_KEY` | Supabase server-only Secret key (or legacy `service_role` key) |
| `GX_ADMIN_EMAILS` | Comma-separated administrator email addresses |

Render must receive the server-only key as a secret environment variable. The API refuses to start in production when required Supabase or administrator configuration is missing. The local JSON adapter is retained for development only.

## Render panel environments

Each panel service also needs:

| Variable | Value |
| --- | --- |
| `GX_SUPABASE_URL` | Supabase project base URL |
| `GX_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable key |
| `GX_API_URL` | Public HTTPS URL of the API service |

Do not add `GX_SUPABASE_SECRET_KEY` or the legacy `service_role` key to either panel service.
