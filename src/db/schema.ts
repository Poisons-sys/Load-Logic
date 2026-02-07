import { 
  pgTable, 
  uuid, 
  varchar, 
  text, 
  timestamp, 
  boolean, 
  integer, 
  real, 
  jsonb,
  pgEnum,
  primaryKey
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ============================================
// ENUMS
// ============================================
export const userRoleEnum = pgEnum('user_role', ['admin', 'operativo', 'supervisor'])

export const productCategoryEnum = pgEnum('product_category', [
  'automotriz', 'electronica', 'maquinaria', 'medico', 'energia', 
  'infraestructura', 'carnicos', 'lacteos', 'frutas_verduras', 
  'procesados', 'congelados', 'granos', 'peligrosas', 'generales'
])

export const fragilityEnum = pgEnum('fragility_level', ['baja', 'media', 'alta', 'muy_alta'])

export const temperatureEnum = pgEnum('temperature_req', ['ambiente', 'refrigerado', 'congelado', 'caliente'])

export const vehicleTypeEnum = pgEnum('vehicle_type', [
  'camion', 'remolque', 'caja_seca', 'refrigerado', 'plataforma', 'cisterna'
])

export const loadStatusEnum = pgEnum('load_status', ['pendiente', 'optimizado', 'aprobado', 'ejecutado'])

// ============================================
// TABLA: EMPRESAS
// ============================================
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  rfc: varchar('rfc', { length: 13 }).notNull().unique(),
  address: text('address'),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  licenseType: varchar('license_type', { length: 50 }).default('matriz'),
  maxUsers: integer('max_users').default(10),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ============================================
// TABLA: USUARIOS
// ============================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: userRoleEnum('role').default('operativo'),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').default(true),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ============================================
// TABLA: SESIONES (para NextAuth y manejo de sesiones)
// ============================================
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ============================================
// TABLA: TOKENS DE VERIFICACIÓN (para verificación de email, reset password)
// ============================================
export const verificationTokens = pgTable('verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expires: timestamp('expires').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// ============================================
// TABLA: PRODUCTOS/MERCANCÍAS
// ============================================
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: productCategoryEnum('category').notNull(),
  subcategory: varchar('subcategory', { length: 100 }),
  hsCode: varchar('hs_code', { length: 20 }),
  
  // Dimensiones
  length: real('length').notNull(),
  width: real('width').notNull(),
  height: real('height').notNull(),
  weight: real('weight').notNull(),
  volume: real('volume').notNull(),
  
  // Características
  fragility: fragilityEnum('fragility').default('baja'),
  stackable: boolean('stackable').default(true),
  maxStackHeight: integer('max_stack_height').default(1),
  
  // Requisitos de temperatura
  temperatureReq: temperatureEnum('temperature_req').default('ambiente'),
  temperatureMin: real('temperature_min'),
  temperatureMax: real('temperature_max'),
  humiditySensitive: boolean('humidity_sensitive').default(false),
  
  // Materiales peligrosos
  isHazardous: boolean('is_hazardous').default(false),
  hazardClass: varchar('hazard_class', { length: 50 }),
  unNumber: varchar('un_number', { length: 10 }),
  nom002Compliance: boolean('nom002_compliance').default(false),
  
  // Compatibilidad
  incompatibleWith: text('incompatible_with').array(),
  specialInstructions: text('special_instructions'),
  
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ============================================
// TABLA: UNIDADES DE TRANSPORTE
// ============================================
export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  type: vehicleTypeEnum('type').notNull(),
  plateNumber: varchar('plate_number', { length: 20 }).notNull(),
  
  // Dimensiones internas (cm)
  internalLength: real('internal_length').notNull(),
  internalWidth: real('internal_width').notNull(),
  internalHeight: real('internal_height').notNull(),
  
  // Capacidades
  maxWeight: real('max_weight').notNull(),
  maxVolume: real('max_volume').notNull(),
  
  // Refrigeración
  hasRefrigeration: boolean('has_refrigeration').default(false),
  minTemperature: real('min_temperature'),
  maxTemperature: real('max_temperature'),
  
  // Ejes y distribución de peso (kg)
  axles: integer('axles').default(2),
  frontAxleMaxWeight: real('front_axle_max_weight').default(7000),
  rearAxleMaxWeight: real('rear_axle_max_weight').default(17000),
  
  // Normativas
  nom012Compliant: boolean('nom012_compliant').default(true),
  nom068Compliant: boolean('nom068_compliant').default(true),
  hazardousMaterialAuthorized: boolean('hazardous_material_authorized').default(false),
  
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ============================================
// TABLA: PLANES DE CARGA
// ============================================
export const loadPlans = pgTable('load_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id),
  
  // Métricas
  totalWeight: real('total_weight').default(0),
  totalVolume: real('total_volume').default(0),
  spaceUtilization: real('space_utilization').default(0),
  weightDistribution: jsonb('weight_distribution'),
  
  // Estado
  status: loadStatusEnum('status').default('pendiente'),
  
  // Normativas cumplidas
  nom002Compliant: boolean('nom002_compliant').default(true),
  nom012Compliant: boolean('nom012_compliant').default(true),
  nom015Compliant: boolean('nom015_compliant').default(true),
  
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ============================================
// TABLA: ITEMS EN PLAN DE CARGA
// ============================================
export const loadPlanItems = pgTable('load_plan_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  loadPlanId: uuid('load_plan_id').references(() => loadPlans.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id),
  quantity: integer('quantity').notNull(),
  
  // Posición en la estiba
  positionX: real('position_x'),
  positionY: real('position_y'),
  positionZ: real('position_z'),
  
  // Rotación
  rotationX: real('rotation_x').default(0),
  rotationY: real('rotation_y').default(0),
  rotationZ: real('rotation_z').default(0),
  
  // Orden de carga
  loadingOrder: integer('loading_order'),
  
  createdAt: timestamp('created_at').defaultNow(),
})

// ============================================
// TABLA: INSTRUCCIONES DE CARGA
// ============================================
export const loadingInstructions = pgTable('loading_instructions', {
  id: uuid('id').primaryKey().defaultRandom(),
  loadPlanId: uuid('load_plan_id').references(() => loadPlans.id, { onDelete: 'cascade' }),
  step: integer('step').notNull(),
  description: text('description').notNull(),
  itemId: uuid('item_id').references(() => loadPlanItems.id),
  position: jsonb('position'),
  orientation: varchar('orientation', { length: 20 }),
  specialNotes: text('special_notes'),
})

// ============================================
// TABLA: REPORTES
// ============================================
export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  loadPlanId: uuid('load_plan_id').references(() => loadPlans.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  format: varchar('format', { length: 20 }).notNull(),
  fileUrl: text('file_url'),
  generatedBy: uuid('generated_by').references(() => users.id),
  generatedAt: timestamp('generated_at').defaultNow(),
})

// ============================================
// TABLA: LOGS DE ACTIVIDAD (para auditoría)
// ============================================
export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(), // 'product', 'vehicle', 'loadPlan', etc.
  entityId: uuid('entity_id'),
  details: jsonb('details'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
})

// ============================================
// RELACIONES
// ============================================
export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  products: many(products),
  vehicles: many(vehicles),
  loadPlans: many(loadPlans),
  activityLogs: many(activityLogs),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  sessions: many(sessions),
  loadPlans: many(loadPlans),
  reports: many(reports),
  activityLogs: many(activityLogs),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  company: one(companies, {
    fields: [products.companyId],
    references: [companies.id],
  }),
  loadPlanItems: many(loadPlanItems),
}))

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  company: one(companies, {
    fields: [vehicles.companyId],
    references: [companies.id],
  }),
  loadPlans: many(loadPlans),
}))

export const loadPlansRelations = relations(loadPlans, ({ one, many }) => ({
  company: one(companies, {
    fields: [loadPlans.companyId],
    references: [companies.id],
  }),
  vehicle: one(vehicles, {
    fields: [loadPlans.vehicleId],
    references: [vehicles.id],
  }),
  createdByUser: one(users, {
    fields: [loadPlans.createdBy],
    references: [users.id],
  }),
  items: many(loadPlanItems),
  instructions: many(loadingInstructions),
  reports: many(reports),
}))

export const loadPlanItemsRelations = relations(loadPlanItems, ({ one }) => ({
  loadPlan: one(loadPlans, {
    fields: [loadPlanItems.loadPlanId],
    references: [loadPlans.id],
  }),
  product: one(products, {
    fields: [loadPlanItems.productId],
    references: [products.id],
  }),
}))

export const loadingInstructionsRelations = relations(loadingInstructions, ({ one }) => ({
  loadPlan: one(loadPlans, {
    fields: [loadingInstructions.loadPlanId],
    references: [loadPlans.id],
  }),
  item: one(loadPlanItems, {
    fields: [loadingInstructions.itemId],
    references: [loadPlanItems.id],
  }),
}))

export const reportsRelations = relations(reports, ({ one }) => ({
  loadPlan: one(loadPlans, {
    fields: [reports.loadPlanId],
    references: [loadPlans.id],
  }),
  generatedByUser: one(users, {
    fields: [reports.generatedBy],
    references: [users.id],
  }),
}))

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [activityLogs.companyId],
    references: [companies.id],
  }),
}))
