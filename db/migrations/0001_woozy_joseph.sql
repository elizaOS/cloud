ALTER TABLE "agents" DROP CONSTRAINT "name_unique";--> statement-breakpoint
ALTER TABLE "containers" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_character_id_user_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."user_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "containers_character_idx" ON "containers" USING btree ("character_id");