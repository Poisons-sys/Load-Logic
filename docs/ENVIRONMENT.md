# Entornos y Variables

Este documento define variables por entorno para ejecutar Load Logic.

## Variables requeridas

- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- Una de estas para DB:
  - `DATABASE_URL_POOLED` (recomendada)
  - `DATABASE_URL`
  - `POSTGRES_URL`

## Variables opcionales (scripts)

- `SEED_COMPANY_NAME`
- `SEED_COMPANY_RFC`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_ADMIN_NAME`
- `SMOKE_BASE_URL`
- `SMOKE_EMAIL`
- `SMOKE_PASSWORD`
- `CATALOG_COMPANY_ID`
- `CATALOG_COMPANY_RFC`
- `CATALOG_TARGET_EMAIL`

## Plantilla sugerida para desarrollo (`.env`)

```env
DATABASE_URL_POOLED=postgresql://...
NEXTAUTH_SECRET=dev_secret_change_me
NEXTAUTH_URL=http://localhost:3000

SEED_COMPANY_NAME=LoadLogic S.A. de C.V.
SEED_COMPANY_RFC=RFC1234567890
SEED_ADMIN_EMAIL=admin@local.test
SEED_ADMIN_PASSWORD=12345
SEED_ADMIN_NAME=Administrador
```

## Staging

- Usar DB separada de produccion.
- Usar `NEXTAUTH_SECRET` distinto a dev/prod.
- Configurar `NEXTAUTH_URL` al dominio real de staging.
- Ejecutar smoke tests contra staging antes de release.

## Produccion

- Secretos unicamente via proveedor de despliegue (no subir a git).
- DB con backup automatizado y acceso restringido.
- `NEXTAUTH_URL` debe ser dominio final HTTPS.
- Rotar secretos ante cualquier incidente.

## Verificaciones rapidas

1. App arranca sin error de DB.
2. Login funciona y persiste sesion.
3. API de `load-plans` responde 2xx.
4. `npm run lint` y pruebas clave en verde.
