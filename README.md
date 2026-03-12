# Load Logic

Sistema de optimización de estiba y distribución de carga para transporte terrestre.

## Descripción

Load Logic es una aplicación web desarrollada con Next.js, TypeScript, Drizzle ORM, Three.js y Neon Serverless PostgreSQL.  
Permite a empresas transportistas optimizar la distribución de carga en unidades de transporte, validar riesgos operativos y mantener trazabilidad del layout 3D con historial de versiones.

Además de optimizar, la plataforma ya permite:

- Visualizar la carga en 3D.
- Editar manualmente el layout de la unidad.
- Guardar y restaurar versiones del plan de carga.
- Generar reportes PDF.
- Revisar métricas avanzadas y validaciones legibles para operación.

## Estado actual (MVP operable)

- Flujo principal funcional: `Nueva Estiba -> Optimizar -> Ver 3D -> Editar Carga de Unidad -> Guardar Versión -> Restaurar Versión -> PDF`.
- Motor de optimización con estrategias `baseline` e `intelligent`.
- Persistencia por pieza del layout 3D mediante `load_plan_placements`.
- Historial de versiones mediante `load_plan_versions`.
- Hardening de apilado para reducir gaps y falsos `UNSUPPORTED_STACK`.
- Checklists de QA y release disponibles en `docs/`.

## Características principales

- Gestión de usuarios: roles (`Administrador`, `Operativo`, `Supervisor`) por empresa.
- Gestión de mercancías: productos con dimensiones, peso, fragilidad, temperatura y reglas de manejo.
- Gestión de unidades: dimensiones internas, capacidad máxima y configuración de ejes.
- Optimización de estiba: algoritmo 3D de bin packing con score, KPIs y validaciones.
- Visualización 3D: inspección del layout y apoyo para revisión operativa.
- Edición manual de layout: submódulo para ajustar carga y guardar versión manual.
- Reportes: generación de PDF e instrucciones de carga.
- Cumplimiento operativo: validaciones de ejes, estabilidad, centro de gravedad y riesgos de apilado.

## Stack tecnológico

- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS.
- Backend: Next.js API Routes, Drizzle ORM.
- Base de datos: Neon Serverless PostgreSQL.
- Visualización 3D: Three.js, React Three Fiber, Drei.
- UI Components: shadcn/ui, Radix UI.
- Reportes: jsPDF, jspdf-autotable.
- Autenticación: NextAuth (Credentials + JWT session).

## Categorías de productos soportadas

### Sector industrial
- Automotriz (autopartes, motores, transmisiones)
- Electrónica y tecnología
- Maquinaria industrial
- Dispositivos médicos
- Energía y baterías
- Componentes de infraestructura

### Alimentos
- Cárnicos y productos de origen animal
- Lácteos
- Frutas y verduras frescas
- Alimentos procesados y empacados
- Alimentos congelados
- Granos y alimentos a granel

### Materiales peligrosos
- Sustancias peligrosas (NOM-002-SCT/2023)
- Baterías de litio
- Productos químicos

## Normativas soportadas

### México (NOM)
- NOM-002-SCT/2023 - Materiales peligrosos
- NOM-012-SCT-2-2017 - Peso y dimensiones
- NOM-015-SCT-2-2022 - Estiba y sujeción
- NOM-068-SCT-2-2014 - Condiciones físico-mecánicas
- NOM-120-SSA1-1994 - Prácticas de higiene
- NOM-251-SSA1-2009 - Manejo de alimentos
- NOM-194-SSA1-2004 - Transporte refrigerado

### Estados Unidos
- 49 CFR - Hazardous Materials Regulations
- FMCSR - Federal Motor Carrier Safety Regulations
- FSMA - Food Safety Modernization Act
- FDA Sanitary Transportation Rule

## Instalación

1. Clonar el repositorio:

```bash
git clone <repository-url>
cd load-logic
```

2. Instalar dependencias:

```bash
npm install
```

3. Configurar variables de entorno en `.env`:

```env
# Base de datos (usar al menos una)
DATABASE_URL_POOLED=postgresql://...
DATABASE_URL=postgresql://...
POSTGRES_URL=postgresql://...

# Auth
NEXTAUTH_SECRET=tu_secreto
NEXTAUTH_URL=http://localhost:3000

# Opcional: seed base
SEED_COMPANY_NAME=LoadLogic S.A. de C.V.
SEED_COMPANY_RFC=RFC1234567890
SEED_ADMIN_EMAIL=admin@local.test
SEED_ADMIN_PASSWORD=12345
SEED_ADMIN_NAME=Administrador
```

4. Configurar base de datos Neon:
- Crear base en Neon.
- Copiar URL de conexión a `DATABASE_URL_POOLED` o `DATABASE_URL`.

5. Aplicar esquema:

```bash
npm run db:push
```

6. Seed inicial (opcional, recomendado):

```bash
npm run db:seed
```

7. Iniciar servidor de desarrollo:

```bash
npm run dev
```

8. Abrir `http://localhost:3000`.

## Credenciales de demo / local

No hay credenciales demo fijas para producción.

En local puedes crear un admin con:

- `npm run db:seed` usando `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`, o
- Registro vía UI/API (`/api/auth/register`).

## Scripts disponibles

```bash
npm run dev                         # Iniciar servidor de desarrollo
npm run build                       # Construir para producción
npm run start                       # Iniciar servidor de producción
npm run lint                        # Ejecutar ESLint

npm run test:regression             # Pruebas de regresión del motor
npm run test:smoke:load-plan        # Smoke test de flujo principal
npm run test:smoke:layout-roundtrip # Smoke test guardar/restaurar layout

npm run db:generate                 # Generar migraciones
npm run db:migrate                  # Ejecutar migraciones
npm run db:push                     # Push schema a la base de datos
npm run db:studio                   # Abrir Drizzle Studio
npm run db:seed                     # Seed base
npm run db:seed:qa-catalog          # Seed catálogo QA realista
npm run db:backfill:placements      # Backfill de placements históricos
```

## Estructura del proyecto

```text
load-logic/
|- src/
|  |- app/                           # Next.js App Router
|  |  |- dashboard/
|  |  |- optimize/                   # Nueva Estiba
|  |  |- load-plans/                 # Planes de carga
|  |  |  |- [id]/view/               # Ver 3D
|  |  |  |- [id]/edit-layout/        # Editar Carga de Unidad
|  |  |- reports/
|  |  |- products/
|  |  |- vehicles/
|  |  |- users/
|  |  |- settings/
|  |  |- profile/
|  |  |- analytics/
|  |  '- api/                        # Endpoints backend
|  |- components/
|  |  |- ui/
|  |  |- LoadVisualizer3D.tsx
|  |  |- Header.tsx
|  |  '- Sidebar.tsx
|  |- db/
|  |  |- index.ts
|  |  |- schema.ts
|  |  '- seed.ts
|  |- lib/
|  |  |- optimization.ts
|  |  |- optimization.regression.test.ts
|  |  |- auth-server.ts
|  |  '- utils.ts
|  '- scripts/
|     |- smoke-load-plan-flow.ts
|     '- smoke-layout-roundtrip.ts
|- docs/
|  |- CHANGELOG.md
|  |- ENVIRONMENT.md
|  |- OPERATIONS.md
|  |- CONTRIBUTING.md
|  |- QA-E2E-CHECKLIST.md
|  |- RELEASE-CHECKLIST.md
|  '- CLOSEOUT-1-4-5.md
|- drizzle/
|- package.json
|- tsconfig.json
'- README.md
```

## Algoritmo de optimización

El sistema utiliza un algoritmo de Bin Packing 3D que considera:

- Dimensiones de productos y contenedor.
- Peso total y distribución por ejes.
- Fragilidad (prioriza menor riesgo de carga superior).
- Reglas de manejo: `floorOnly`, `noStackAbove`, `maxTopLoadKg`, rotación permitida.
- Apilamiento y soporte real entre cajas.
- Riesgo de estabilidad y centro de gravedad.
- Balance longitudinal y cumplimiento del perfil de ejes.
- Penalización de validaciones críticas en estrategia `intelligent`.

Salida principal del motor:

- Ítems colocados/no colocados.
- Utilización, heatmap, peso por zonas.
- Centro de gravedad y estabilidad.
- Validaciones con severidad (`info`, `warning`, `critical`).
- KPI global y score de optimización.

## Flujo operativo recomendado

1. Crear plan en `Nueva Estiba`.
2. Ejecutar optimización (`baseline` o `intelligent`).
3. Revisar métricas y validaciones.
4. Abrir `Ver 3D`.
5. Entrar a `Editar Carga de Unidad` para ajuste manual.
6. Guardar versión manual.
7. Restaurar versión si aplica.
8. Generar PDF.

## QA y release

Antes de liberar:

1. Ejecutar lint y pruebas de regresión.
2. Ejecutar smoke tests del flujo.
3. Completar checklist QA: `docs/QA-E2E-CHECKLIST.md`.
4. Completar checklist release: `docs/RELEASE-CHECKLIST.md`.
5. Validar cierre operativo: `docs/CLOSEOUT-1-4-5.md`.

Nota: en entornos restringidos puede aparecer `spawn EPERM` para algunos tests/smokes. En ese caso, ejecutar en CI o en entorno local sin bloqueo de procesos.

## Troubleshooting rápido

- Error `spawn EPERM` en pruebas smoke/regresión:
  - Ejecutar pruebas en CI o en entorno local sin restricción de procesos.
- Error de conexión DB al iniciar:
  - Validar `DATABASE_URL_POOLED` o `DATABASE_URL` o `POSTGRES_URL`.
  - Confirmar conectividad a Neon y credenciales activas.
- Login no persiste sesión:
  - Validar `NEXTAUTH_SECRET` y `NEXTAUTH_URL`.
  - Borrar cookies/sesión del navegador y reintentar.
- No aparecen productos o unidades:
  - Verificar datos base con `npm run db:seed` o `npm run db:seed:qa-catalog`.

## Despliegue

### Vercel (recomendado)

1. Crear cuenta en Vercel.
2. Importar repositorio.
3. Configurar variables de entorno.
4. Ejecutar migraciones DB.
5. Desplegar.

```bash
npm i -g vercel
vercel
```

### Variables de entorno requeridas

- `DATABASE_URL_POOLED` o `DATABASE_URL` o `POSTGRES_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

Variables opcionales (pruebas/scripts):

- `SMOKE_BASE_URL`
- `SMOKE_EMAIL`
- `SMOKE_PASSWORD`
- `CATALOG_COMPANY_ID`
- `CATALOG_COMPANY_RFC`
- `CATALOG_TARGET_EMAIL`

## Documentación complementaria

- Changelog: `docs/CHANGELOG.md`
- Entornos y variables: `docs/ENVIRONMENT.md`
- Runbook operativo: `docs/OPERATIONS.md`
- Guía de contribución: `docs/CONTRIBUTING.md`
- QA E2E checklist: `docs/QA-E2E-CHECKLIST.md`
- Release checklist: `docs/RELEASE-CHECKLIST.md`
- Cierre operativo 1-4-5: `docs/CLOSEOUT-1-4-5.md`

## Licencia

Uso interno del proyecto/equipo.

## Soporte

Para soporte técnico u operativo, usar la documentación en `docs/` y el canal interno del equipo de desarrollo.

---

**Load Logic** - Optimización inteligente de carga para transporte terrestre.
