CREATE TABLE "eliza_room_characters" (
	"room_id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eliza_room_characters" ADD CONSTRAINT "eliza_room_characters_character_id_user_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."user_characters"("id") ON DELETE cascade ON UPDATE no action;