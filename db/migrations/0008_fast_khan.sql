ALTER TABLE "n8n_workflow_executions" ADD COLUMN "trigger_id" uuid;--> statement-breakpoint
CREATE INDEX "n8n_workflow_executions_trigger_id_idx" ON "n8n_workflow_executions" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "n8n_workflow_executions_trigger_date_idx" ON "n8n_workflow_executions" USING btree ("trigger_id","created_at");