-- Custom SQL migration file, put your SQL below!
-- Migration: App earnings trigger and backfill
-- Description: Adds trigger to auto-create app_earnings records when apps are created
--              Also backfills earnings for existing apps and adds table/column documentation
-- Type: Custom (triggers, backfills, comments - not expressible in TypeScript schemas)

-- ============================================
-- Trigger Function: Auto-create app_earnings on app creation
-- ============================================

CREATE OR REPLACE FUNCTION create_app_earnings_on_app_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO app_earnings (app_id) VALUES (NEW.id)
  ON CONFLICT (app_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

DROP TRIGGER IF EXISTS trigger_create_app_earnings ON apps;

--> statement-breakpoint

CREATE TRIGGER trigger_create_app_earnings
  AFTER INSERT ON apps
  FOR EACH ROW
  EXECUTE FUNCTION create_app_earnings_on_app_insert();

--> statement-breakpoint

-- ============================================
-- Backfill: Create app_earnings for existing apps
-- ============================================

INSERT INTO app_earnings (app_id)
SELECT id FROM apps
WHERE id NOT IN (SELECT app_id FROM app_earnings)
ON CONFLICT (app_id) DO NOTHING;

--> statement-breakpoint

-- ============================================
-- Comments: Documentation for app monetization tables
-- ============================================

COMMENT ON TABLE app_credit_balances IS 'Per-app credit balances for users. Users have separate balances for each miniapp.';
--> statement-breakpoint
COMMENT ON TABLE app_earnings IS 'Aggregate earnings summary for app creators.';
--> statement-breakpoint
COMMENT ON TABLE app_earnings_transactions IS 'Individual earnings events for detailed history.';
--> statement-breakpoint
COMMENT ON COLUMN apps.monetization_enabled IS 'Whether this app has monetization enabled for the creator.';
--> statement-breakpoint
COMMENT ON COLUMN apps.inference_markup_percentage IS 'Creator markup on inference costs (0-1000%).';
--> statement-breakpoint
COMMENT ON COLUMN apps.purchase_share_percentage IS 'Percentage of credit purchases creator earns (default 10%).';
--> statement-breakpoint
COMMENT ON COLUMN apps.platform_offset_amount IS 'Amount platform deducts to cover infrastructure costs.';
