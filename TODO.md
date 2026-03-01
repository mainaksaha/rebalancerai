# RebalancerAI — TODO

## 1. Real Stock Prices [ ]
Replace static `MOCK_PRICES` dict in `backend/core/portfolio.py` with live price fetching.
- Pick a free API (Finnhub / Twelve Data / yfinance)
- Create `backend/core/prices.py` with a `get_prices(tickers: list[str]) -> dict` function
- Add caching (TTL ~60s) so we don't hammer the API on every request
- Wire into `get_portfolio_with_values()` and agent tools

## 2. Settings / Portfolio Management Page [ ]
Build the `/settings` page so users can manage their holdings without editing JSON.
- Frontend: `/settings` page with add / edit / delete position UI
- Backend: `PUT /portfolio/holdings`, `POST /portfolio/holdings`, `DELETE /portfolio/holdings/{ticker}`
- For now, still write to `backend/data/portfolio.json` (pre-Supabase)

## 3. Supabase Wiring — No Auth (demo user) [ ]
Replace JSON file reads/writes with Supabase queries using a hardcoded demo `user_id`.
- Install `supabase-py` in backend, `@supabase/supabase-js` in frontend
- Create `backend/core/db.py` — Supabase client
- Replace `core/portfolio.py` file reads → `portfolios` + `holdings` tables
- Replace `core/rules.py` file reads → `rules` table
- Keep `rebalance_history` table — write executed rebalance plans

## 4. Auth (Supabase Auth) [ ]
Add login / signup so each user gets their own portfolio and rules.
- Supabase Auth (email + password to start)
- Frontend: `/login` and `/signup` pages
- Backend: validate JWT from `Authorization` header, extract `user_id`
- Replace hardcoded demo user_id with real auth.uid()

---

## Later / Nice-to-have
- [ ] Deploy backend (Railway)
- [ ] Real QQQ data fetch (Playwright job, currently manual)
- [ ] Rebalance history page (show past executions)
- [ ] Stock search / autocomplete when adding holdings
