# RebalancerAI — TODO

## ✅ 1. Real Stock Prices
Live yfinance prices with 60s TTL cache in `backend/core/prices.py`.

## ✅ 2. Settings / Portfolio Management Page
`/settings` page with add / edit / delete holdings + cash balance. Supabase-backed.

## ✅ 3. Supabase Wiring — No Auth (demo user)
All reads/writes go through Supabase. Hardcoded DEMO_USER_ID for pre-auth mode.

## 4. Auth (Supabase Auth) [ ]
Add login / signup so each user gets their own portfolio and rules.
- Supabase Auth (email + password to start)
- Frontend: `/login` and `/signup` pages, protect routes
- Backend: validate JWT from `Authorization` header, extract `user_id`
- Replace hardcoded `DEMO_USER_ID` with real `auth.uid()`
- Re-add FK constraints to `auth.users` (dropped in migration for demo mode)

---

## Later / Nice-to-have
- [ ] Deploy backend (Railway)
- [ ] Rebalance history page (show past executions)
- [ ] Stock search / autocomplete when adding holdings
- [ ] Real QQQ data fetch (Playwright job, currently manual)
