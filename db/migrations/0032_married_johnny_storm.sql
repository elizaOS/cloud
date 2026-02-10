ALTER TABLE "service_pricing_audit" DROP CONSTRAINT "service_pricing_audit_service_pricing_id_service_pricing_id_fk";
--> statement-breakpoint
ALTER TABLE "service_pricing_audit" ADD CONSTRAINT "service_pricing_audit_service_pricing_id_service_pricing_id_fk" FOREIGN KEY ("service_pricing_id") REFERENCES "public"."service_pricing"("id") ON DELETE set null ON UPDATE no action;