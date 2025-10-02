-- Add workos_user_id column to users table
ALTER TABLE "users" ADD COLUMN "workos_user_id" text;

-- Add unique constraint
ALTER TABLE "users" ADD CONSTRAINT "users_workos_user_id_unique" UNIQUE("workos_user_id");

-- Create index for workos_user_id
CREATE INDEX "users_workos_user_id_idx" ON "users" ("workos_user_id");
