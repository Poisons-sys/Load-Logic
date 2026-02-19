ALTER TABLE "products"
ADD COLUMN "max_top_load_kg" real DEFAULT 2500;
--> statement-breakpoint
ALTER TABLE "products"
ADD COLUMN "allow_rotate_90" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "products"
ADD COLUMN "no_stack_above" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "products"
ADD COLUMN "floor_only" boolean DEFAULT false;
--> statement-breakpoint

ALTER TABLE "load_plans"
ADD COLUMN "advanced_metrics" jsonb;
--> statement-breakpoint
ALTER TABLE "load_plans"
ADD COLUMN "optimization_score" real DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "load_plans"
ADD COLUMN "layout_version" integer DEFAULT 1;
--> statement-breakpoint

ALTER TABLE "load_plan_items"
ADD COLUMN "route_stop" integer DEFAULT 1;
--> statement-breakpoint

CREATE TABLE "load_plan_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "load_plan_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "source" varchar(30) DEFAULT 'optimize',
  "snapshot" jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "load_plan_versions" ADD CONSTRAINT "load_plan_versions_load_plan_id_load_plans_id_fk" FOREIGN KEY ("load_plan_id") REFERENCES "public"."load_plans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "load_plan_versions" ADD CONSTRAINT "load_plan_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "load_plan_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "company_id" uuid,
  "vehicle_id" uuid,
  "items" jsonb NOT NULL,
  "metadata" jsonb,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "load_plan_templates" ADD CONSTRAINT "load_plan_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "load_plan_templates" ADD CONSTRAINT "load_plan_templates_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "load_plan_templates" ADD CONSTRAINT "load_plan_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
