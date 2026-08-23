ALTER TABLE "connections" DROP CONSTRAINT IF EXISTS "connections_upgrade_requested_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_upgrade_requested_by_users_id_fk" FOREIGN KEY ("upgrade_requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
