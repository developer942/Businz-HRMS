# Businz HRMS VPS Deployment

This stack runs Businz HRMS with a VPS-hosted PostgreSQL database. It does not use the Supabase cloud project.

## Services

- `postgres`: HRMS PostgreSQL database.
- `postgrest`: PostgreSQL REST API.
- `rest-proxy`: exposes a Supabase-style `/rest/v1` path for existing app code.
- `backend`: Node/Express HRMS API.
- `frontend`: React production build served by nginx.

## Deploy

```bash
cd deploy/vps
cp .env.example .env
nano .env
docker compose up -d --build
```

Use strong unique values for:

- `POSTGRES_PASSWORD`
- `PGRST_JWT_SECRET`
- `JWT_SECRET`

After startup:

```bash
docker compose ps
curl http://localhost/health
curl http://localhost/api/v1/health/ready
```

## Notes

The schema includes small compatibility shims for `auth` and `storage` so the old Supabase-oriented SQL can initialize on normal PostgreSQL. The app talks to the VPS database through `/rest/v1` and the backend talks to the same local REST proxy.
