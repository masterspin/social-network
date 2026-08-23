ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_username_unique";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "username";--> statement-breakpoint
