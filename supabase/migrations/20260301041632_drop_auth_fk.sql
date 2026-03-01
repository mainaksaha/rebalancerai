-- Drop auth.users FK constraints for pre-auth demo mode.
-- When auth is added, recreate these with real Supabase Auth user IDs.
ALTER TABLE portfolios        DROP CONSTRAINT IF EXISTS portfolios_user_id_fkey;
ALTER TABLE holdings          DROP CONSTRAINT IF EXISTS holdings_user_id_fkey;
ALTER TABLE rebalance_history DROP CONSTRAINT IF EXISTS rebalance_history_user_id_fkey;
ALTER TABLE rules             DROP CONSTRAINT IF EXISTS rules_user_id_fkey;
