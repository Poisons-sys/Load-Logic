# Cierre 1, 4 y 5

Fecha: 2026-03-12

## Resumen de estado
- Punto 1 (QA funcional end-to-end): En progreso
- Punto 4 (Validacion en produccion con datos reales): Pendiente de ejecucion operativa
- Punto 5 (Checklist de release): En progreso

## Punto 1 - QA funcional end-to-end
### Flujo objetivo
- Optimizar -> editar manual -> guardar version -> restaurar version -> PDF -> ver metricas/warnings

### Estado actual
- Codigo y rutas para el flujo: Disponibles
- Checklists QA: Disponibles en `docs/QA-E2E-CHECKLIST.md`
- Ejecucion automatizada en este entorno: Bloqueada por `spawn EPERM`

### Evidencia tecnica
- Smoke scripts existentes:
  - `npm run test:smoke:load-plan`
  - `npm run test:smoke:layout-roundtrip`
- Resultado en este entorno: no ejecutables por restriccion de proceso (`spawn EPERM`)

### Accion requerida para cerrar
- Ejecutar smoke tests en CI o entorno local sin bloqueo de `spawn`.
- Completar checklist QA con resultado PASS/FAIL por paso.

## Punto 4 - Validacion en produccion con datos reales (20-30 planes)
### Estado actual
- Pendiente de ejecucion en produccion.
- No se puede cerrar con evidencia local.

### Plan de ejecucion
- Seleccionar 20-30 planes reales en produccion.
- Revisar por plan:
  - sin gap vertical erratico,
  - sin `UNSUPPORTED_STACK` falso positivo,
  - guardar/restaurar version sin regresion visual.
- Registrar resultados:
  - Plan ID
  - Resultado (PASS/FAIL)
  - Hallazgo
  - Captura / evidencia

### Criterio de cierre
- >= 20 planes revisados
- 0 bloqueantes abiertos en gap/apilado

## Punto 5 - Checklist de release
### Estado actual
- Checklist definido en `docs/RELEASE-CHECKLIST.md`.
- Verificacion por codigo completada:
  - Roles en navegacion: `src/components/Sidebar.tsx`
  - `requireAuth` + scope por `companyId`: rutas API bajo `src/app/api/**`
  - Activity logs para optimize/manual/restore:
    - `src/app/api/load-plans/[id]/optimize/route.ts`
    - `src/app/api/load-plans/[id]/restore-version/route.ts`

### Pendiente para cierre operativo
- Monitoreo y alertas activos en entorno destino.
- Respaldo DB reciente verificado.
- Confirmacion de permisos por rol en entorno productivo.

## Bloqueadores actuales
- Entorno de ejecucion con restriccion `spawn EPERM` para `node:test`, `tsx` y `next dev`.

## Proximo paso inmediato
- Correr punto 1 y 4 en entorno de CI/prod con evidencia en este mismo archivo.
