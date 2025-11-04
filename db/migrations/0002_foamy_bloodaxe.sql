CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"amount_due" numeric(10, 2) NOT NULL,
	"amount_paid" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text NOT NULL,
	"invoice_type" text NOT NULL,
	"invoice_number" text,
	"invoice_pdf" text,
	"hosted_invoice_url" text,
	"credits_added" numeric(10, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp,
	"paid_at" timestamp,
	CONSTRAINT "invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_payment_method_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_default_payment_method" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "auto_top_up_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "auto_top_up_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "auto_top_up_threshold" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "auto_top_up_subscription_id" text;--> statement-breakpoint
CREATE INDEX "invoices_organization_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoices_stripe_invoice_idx" ON "invoices" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");