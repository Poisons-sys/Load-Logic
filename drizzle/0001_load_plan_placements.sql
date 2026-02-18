CREATE TABLE "load_plan_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"load_plan_id" uuid NOT NULL,
	"item_id" uuid,
	"product_id" uuid NOT NULL,
	"piece_index" integer DEFAULT 0 NOT NULL,
	"position_x" real NOT NULL,
	"position_y" real NOT NULL,
	"position_z" real NOT NULL,
	"rotation_x" real DEFAULT 0,
	"rotation_y" real DEFAULT 0,
	"rotation_z" real DEFAULT 0,
	"loading_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "load_plan_placements" ADD CONSTRAINT "load_plan_placements_load_plan_id_load_plans_id_fk" FOREIGN KEY ("load_plan_id") REFERENCES "public"."load_plans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "load_plan_placements" ADD CONSTRAINT "load_plan_placements_item_id_load_plan_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."load_plan_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "load_plan_placements" ADD CONSTRAINT "load_plan_placements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
