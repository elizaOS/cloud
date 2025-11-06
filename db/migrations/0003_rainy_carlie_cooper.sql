ALTER TABLE "users" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "work_function" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferences" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "response_notifications" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_notifications" boolean DEFAULT true;--> statement-breakpoint
CREATE INDEX "users_work_function_idx" ON "users" USING btree ("work_function");