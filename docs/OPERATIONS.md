# Runbook Operativo

Guia minima para operar Load Logic en entornos controlados.

## Pre-release

1. Ejecutar `npm run lint`.
2. Ejecutar `npm run test:regression`.
3. Ejecutar smoke tests:
   - `npm run test:smoke:load-plan`
   - `npm run test:smoke:layout-roundtrip`
4. Completar:
   - `docs/QA-E2E-CHECKLIST.md`
   - `docs/RELEASE-CHECKLIST.md`

## Release

1. Confirmar variables de entorno.
2. Aplicar esquema/migraciones DB.
3. Desplegar version.
4. Probar flujo critico:
   - optimizar,
   - editar manual,
   - guardar/restaurar version,
   - generar PDF.

## Monitoreo inicial (24-48h)

- Vigilar errores 5xx en API.
- Vigilar latencia de endpoints de carga y optimizacion.
- Confirmar que no hay regresion de gaps/`UNSUPPORTED_STACK`.
- Registrar incidencias con severidad y plan de accion.

## Respaldo y recuperacion

- Mantener backup DB reciente antes de release.
- Validar restauracion de backup en entorno de prueba periodicamente.
- Si hay incidente bloqueante:
  - rollback de app,
  - verificar consistencia de datos de planes/versiones,
  - reintentar release con fix validado.

## Respuesta a incidentes

1. Clasificar severidad (`critical`, `high`, `medium`, `low`).
2. Identificar modulo afectado (optimizacion, 3D, API, auth, DB).
3. Mitigar (rollback o feature flag si aplica).
4. Documentar causa raiz y accion preventiva.
