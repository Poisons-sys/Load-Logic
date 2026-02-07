# Load Logic

Sistema de optimización de estiba y distribución de carga para transporte terrestre.

## Descripción

Load Logic es una aplicación web desarrollada con Next.js 14, TypeScript, Drizzle ORM, Three.js y Neon Serverless PostgreSQL que permite a empresas transportistas optimizar la distribución de carga en unidades de transporte, cumpliendo con normativas mexicanas (NOM) y estadounidenses.

## Características Principales

- **Gestión de Usuarios**: Roles (Administrador, Operativo, Supervisor) con licencia matriz
- **Gestión de Mercancías**: Registro de productos con dimensiones, peso, fragilidad, temperatura
- **Gestión de Unidades**: Registro de camiones y remolques con especificaciones técnicas
- **Optimización de Estiba**: Algoritmo 3D de bin packing para distribución óptima
- **Visualización 3D**: Visualizador interactivo con Three.js para cubicaje
- **Reportes**: Generación de reportes PDF e instrucciones de carga
- **Cumplimiento Normativo**: Validación de NOM-002, NOM-012, NOM-015, NOM-068, 49 CFR, FSMA

## Stack Tecnológico

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Drizzle ORM
- **Base de Datos**: Neon Serverless PostgreSQL
- **Visualización 3D**: Three.js, React Three Fiber
- **UI Components**: shadcn/ui, Radix UI
- **Reportes**: jsPDF

## Categorías de Productos Soportadas

### Sector Industrial
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

### Materiales Peligrosos
- Sustancias peligrosas (NOM-002-SCT/2023)
- Baterías de litio
- Productos químicos

## Normativas Soportadas

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

3. Configurar variables de entorno:
```bash
cp .env.example .env.local
# Editar .env.local con tus credenciales
```

4. Configurar la base de datos Neon:
- Crear una base de datos en [Neon](https://neon.tech)
- Copiar la URL de conexión a DATABASE_URL

5. Ejecutar migraciones:
```bash
npm run db:push
```

6. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

7. Abrir [http://localhost:3000](http://localhost:3000)

## Credenciales de Demo

- **Email**: admin@loadlogic.com
- **Contraseña**: admin123

## Scripts Disponibles

```bash
npm run dev          # Iniciar servidor de desarrollo
npm run build        # Construir para producción
npm run start        # Iniciar servidor de producción
npm run lint         # Ejecutar ESLint
npm run db:generate  # Generar migraciones
npm run db:migrate   # Ejecutar migraciones
npm run db:push      # Push schema a la base de datos
npm run db:studio    # Abrir Drizzle Studio
```

## Estructura del Proyecto

```
load-logic/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── dashboard/    # Dashboard y páginas principales
│   │   ├── products/     # Gestión de productos
│   │   ├── vehicles/     # Gestión de unidades
│   │   ├── optimize/     # Optimización de estiba
│   │   ├── load-plans/   # Planes de carga
│   │   ├── reports/      # Reportes
│   │   ├── users/        # Gestión de usuarios
│   │   └── settings/     # Configuración
│   ├── components/       # Componentes React
│   │   ├── ui/          # Componentes UI (shadcn)
│   │   ├── LoadVisualizer3D.tsx
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   ├── db/              # Configuración de base de datos
│   │   ├── index.ts
│   │   └── schema.ts    # Esquema Drizzle
│   ├── lib/             # Utilidades
│   │   ├── utils.ts
│   │   └── optimization.ts  # Algoritmo de optimización
│   └── types/           # Tipos TypeScript
│       └── index.ts
├── public/              # Archivos estáticos
├── drizzle/             # Migraciones
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
└── README.md
```

## Algoritmo de Optimización

El sistema utiliza un algoritmo de Bin Packing 3D que considera:

1. **Dimensiones** de productos y contenedor
2. **Peso** y distribución por ejes
3. **Fragilidad** (productos frágiles arriba)
4. **Temperatura** (incompatibilidades)
5. **Apilamiento** (límites de altura)
6. **Materiales peligrosos** (separación requerida)
7. **Compatibilidad química**

## Despliegue

### Vercel (Recomendado)

1. Crear cuenta en [Vercel](https://vercel.com)
2. Importar el repositorio
3. Configurar variables de entorno
4. Desplegar

```bash
npm i -g vercel
vercel
```

### Variables de Entorno Requeridas

- `DATABASE_URL`: URL de conexión a Neon PostgreSQL
- `NEXTAUTH_SECRET`: Clave secreta para NextAuth
- `NEXTAUTH_URL`: URL de la aplicación

## Licencia

Este proyecto es desarrollado como parte de un proyecto universitario.

## Soporte

Para soporte técnico o consultas, contactar al equipo de desarrollo.

---

**Load Logic** - Optimización inteligente de carga para transporte terrestre.
