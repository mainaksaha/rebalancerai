import time
import logging
from typing import Dict, List

import yfinance as yf

logger = logging.getLogger(__name__)

CACHE_TTL = 60  # seconds — re-fetch at most once per minute

_cache: Dict[str, float] = {}
_cache_time: float = 0.0


def get_prices(tickers: List[str]) -> Dict[str, float]:
    """Return latest prices for the given tickers, using a 60-second in-memory cache."""
    global _cache, _cache_time

    if _cache and (time.time() - _cache_time) < CACHE_TTL:
        return _cache

    _cache = _fetch(tickers)
    _cache_time = time.time()
    return _cache


def _fetch(tickers: List[str]) -> Dict[str, float]:
    """Fetch live prices from Yahoo Finance via yfinance."""
    prices: Dict[str, float] = {}
    try:
        objects = yf.Tickers(" ".join(tickers))
        for ticker in tickers:
            try:
                price = objects.tickers[ticker].fast_info["last_price"]
                prices[ticker] = round(float(price), 4) if price else 0.0
            except Exception as e:
                logger.warning("Could not fetch price for %s: %s", ticker, e)
                prices[ticker] = 0.0
    except Exception as e:
        logger.error("yfinance batch fetch failed: %s", e)
        # Return zeros so the app doesn't crash — caller should handle 0.0 gracefully
        for t in tickers:
            prices[t] = 0.0
    return prices
