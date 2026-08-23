CREATE TABLE IF NOT EXISTS "connection_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"description" text,
	"year" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "connection_notes_connection_id_user_id_unique" UNIQUE("connection_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connection_notes" ADD CONSTRAINT "connection_notes_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connection_notes" ADD CONSTRAINT "connection_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connection_notes_user_id_idx" ON "connection_notes" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connection_notes_connection_id_idx" ON "connection_notes" USING btree ("connection_id");
--> statement-breakpoint
INSERT INTO "connection_notes" ("connection_id", "user_id", "description", "year")
SELECT
	"id",
	"requester_id",
	trim(regexp_replace("how_met", '\s*\(\s*Year:\s*\d{4}\s*\)\s*$', '', 'i')),
	substring("how_met" from '\(\s*Year:\s*(\d{4})\s*\)\s*$')
FROM "connections"
WHERE "how_met" IS NOT NULL AND trim("how_met") <> ''
ON CONFLICT ("connection_id","user_id") DO NOTHING;
