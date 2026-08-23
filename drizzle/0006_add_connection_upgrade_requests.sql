ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "upgrade_requested_type" "connection_type";
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "upgrade_requested_by" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connections" ADD CONSTRAINT "connections_upgrade_requested_by_users_id_fk" FOREIGN KEY ("upgrade_requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
