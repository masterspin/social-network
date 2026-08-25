ALTER TABLE "connection_notes" ADD COLUMN IF NOT EXISTS "connection_type" "connection_type" DEFAULT 'one_point_five';
--> statement-breakpoint
INSERT INTO "connection_notes" ("connection_id", "user_id", "connection_type")
SELECT "id", "requester_id", COALESCE("connection_type", 'one_point_five')
FROM "connections"
WHERE "status" = 'accepted'
ON CONFLICT ("connection_id","user_id") DO UPDATE SET
	"connection_type" = COALESCE("connection_notes"."connection_type", EXCLUDED."connection_type"),
	"updated_at" = now();
--> statement-breakpoint
INSERT INTO "connection_notes" ("connection_id", "user_id", "connection_type")
SELECT "id", "recipient_id", COALESCE("connection_type", 'one_point_five')
FROM "connections"
WHERE "status" = 'accepted'
ON CONFLICT ("connection_id","user_id") DO UPDATE SET
	"connection_type" = COALESCE("connection_notes"."connection_type", EXCLUDED."connection_type"),
	"updated_at" = now();
