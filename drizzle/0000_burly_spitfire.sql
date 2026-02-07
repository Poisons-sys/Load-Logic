CREATE TYPE "public"."fragility_level" AS ENUM('baja', 'media', 'alta', 'muy_alta');--> statement-breakpoint
CREATE TYPE "public"."load_status" AS ENUM('pendiente', 'optimizado', 'aprobado', 'ejecutado');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('automotriz', 'electronica', 'maquinaria', 'medico', 'energia', 'infraestructura', 'carnicos', 'lacteos', 'frutas_verduras', 'procesados', 'congelados', 'granos', 'peligrosas', 'generales');--> statement-breakpoint
CREATE TYPE "public"."temperature_req" AS ENUM('ambiente', 'refrigerado', 'congelado', 'caliente');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'operativo', 'supervisor');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('camion', 'remolque', 'caja_seca', 'refrigerado', 'plataforma', 'cisterna');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"company_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid,
	"details" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"rfc" varchar(13) NOT NULL,
	"address" text,
	"phone" varchar(20),
	"email" varchar(255),
	"license_type" varchar(50) DEFAULT 'matriz',
	"max_users" integer DEFAULT 10,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "companies_rfc_unique" UNIQUE("rfc")
);
--> statement-breakpoint
CREATE TABLE "load_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"load_plan_id" uuid,
	"product_id" uuid,
	"quantity" integer NOT NULL,
	"position_x" real,
	"position_y" real,
	"position_z" real,
	"rotation_x" real DEFAULT 0,
	"rotation_y" real DEFAULT 0,
	"rotation_z" real DEFAULT 0,
	"loading_order" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "load_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"vehicle_id" uuid,
	"total_weight" real DEFAULT 0,
	"total_volume" real DEFAULT 0,
	"space_utilization" real DEFAULT 0,
	"weight_distribution" jsonb,
	"status" "load_status" DEFAULT 'pendiente',
	"nom002_compliant" boolean DEFAULT true,
	"nom012_compliant" boolean DEFAULT true,
	"nom015_compliant" boolean DEFAULT true,
	"company_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loading_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"load_plan_id" uuid,
	"step" integer NOT NULL,
	"description" text NOT NULL,
	"item_id" uuid,
	"position" jsonb,
	"orientation" varchar(20),
	"special_notes" text
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" "product_category" NOT NULL,
	"subcategory" varchar(100),
	"hs_code" varchar(20),
	"length" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"weight" real NOT NULL,
	"volume" real NOT NULL,
	"fragility" "fragility_level" DEFAULT 'baja',
	"stackable" boolean DEFAULT true,
	"max_stack_height" integer DEFAULT 1,
	"temperature_req" "temperature_req" DEFAULT 'ambiente',
	"temperature_min" real,
	"temperature_max" real,
	"humidity_sensitive" boolean DEFAULT false,
	"is_hazardous" boolean DEFAULT false,
	"hazard_class" varchar(50),
	"un_number" varchar(10),
	"nom002_compliance" boolean DEFAULT false,
	"incompatible_with" text[],
	"special_instructions" text,
	"company_id" uuid,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"load_plan_id" uuid,
	"type" varchar(50) NOT NULL,
	"format" varchar(20) NOT NULL,
	"file_url" text,
	"generated_by" uuid,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'operativo',
	"company_id" uuid,
	"is_active" boolean DEFAULT true,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "vehicle_type" NOT NULL,
	"plate_number" varchar(20) NOT NULL,
	"internal_length" real NOT NULL,
	"internal_width" real NOT NULL,
	"internal_height" real NOT NULL,
	"max_weight" real NOT NULL,
	"max_volume" real NOT NULL,
	"has_refrigeration" boolean DEFAULT false,
	"min_temperature" real,
	"max_temperature" real,
	"axles" integer DEFAULT 2,
	"front_axle_max_weight" real DEFAULT 7000,
	"rear_axle_max_weight" real DEFAULT 17000,
	"nom012_compliant" boolean DEFAULT true,
	"nom068_compliant" boolean DEFAULT true,
	"hazardous_material_authorized" boolean DEFAULT false,
	"company_id" uuid,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_plan_items" ADD CONSTRAINT "load_plan_items_load_plan_id_load_plans_id_fk" FOREIGN KEY ("load_plan_id") REFERENCES "public"."load_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_plan_items" ADD CONSTRAINT "load_plan_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_plans" ADD CONSTRAINT "load_plans_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_plans" ADD CONSTRAINT "load_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_plans" ADD CONSTRAINT "load_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loading_instructions" ADD CONSTRAINT "loading_instructions_load_plan_id_load_plans_id_fk" FOREIGN KEY ("load_plan_id") REFERENCES "public"."load_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loading_instructions" ADD CONSTRAINT "loading_instructions_item_id_load_plan_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."load_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_load_plan_id_load_plans_id_fk" FOREIGN KEY ("load_plan_id") REFERENCES "public"."load_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;