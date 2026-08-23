CREATE TABLE IF NOT EXISTS "social_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"profile_url" text,
	"email" text,
	"verified_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "social_verifications_user_id_provider_unique" UNIQUE("user_id","provider"),
	CONSTRAINT "social_verifications_provider_provider_account_id_unique" UNIQUE("provider","provider_account_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_verifications" ADD CONSTRAINT "social_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_verifications_user_id_idx" ON "social_verifications" USING btree ("user_id");
