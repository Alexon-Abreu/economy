#!/usr/bin/env python3
import os, json, sys
from datetime import date, datetime, timedelta
import requests
import yfinance as yf
import pandas as pd

FRED_API_KEY = os.environ.get("FRED_API_KEY")
if not FRED_API_KEY:
    print("ERROR: FRED_API_KEY is not set.", file=sys.stderr)
    sys.exit(1)

BILLIONS_PER_POINT = float(os.environ.get("BILLIONS_PER_POINT", "1.05"))
# Use FT Wilshire 5000 ticker and fallback to W5000
INDEX_TICKERS = ["^FTW5000", "^W5000"]

def fetch_gdp_series():
    url = f"https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key={FRED_API_KEY}&file_type=json"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    js = r.json()
    obs = js.get("observations", [])
    gdp = [(o["date"], o["value"]) for o in obs if o.get("value") not in (None, ".", "")]
    return [(pd.to_datetime(d).date(), float(v)) for d, v in gdp]

def fetch_index_history():
    """Fetch Wilshire 5000 history; return (Series, used_ticker)."""
    for t in INDEX_TICKERS:
        download_periods = ("max", "30y", "10y", "5y", "2y")
        for period in download_periods:
            try:
                df = yf.download(t, period=period, interval="1d", progress=False, auto_adjust=False)
                if df is None or df.empty:
                    continue

                # In CI, yfinance can return a 1-col DataFrame for 'Close' (MultiIndex columns).
                if "Close" in df:
                    s = df["Close"]
                else:
                    # Fallback: try to find a 'Close' column via fuzzy match
                    close_like = [c for c in df.columns if isinstance(c, str) and c.lower() == "close"]
                    s = df[close_like[0]] if close_like else df.iloc[:, 0]

                # If it's a DataFrame (1 column), squeeze to Series
                if isinstance(s, pd.DataFrame):
                    s = s.iloc[:, 0]

                # Clean/normalize
                s = pd.to_numeric(s, errors="coerce").dropna()
                if s.empty:
                    continue

                s.index = pd.to_datetime(s.index).date
                return s, t
            except Exception as e:
                print(f"[warn] fetch_index_history {t} period={period} failed: {e}", file=sys.stderr)
                continue

    raise RuntimeError("No Wilshire 5000 history available from yfinance (both tickers empty).")


def build_series():
    idx_series, used_ticker = fetch_index_history()

    # Guard: ensure we really have a Series with a date index
    if not isinstance(idx_series, pd.Series) or idx_series.empty:
        raise RuntimeError(f"Invalid Wilshire series: type={type(idx_series)}, size={getattr(idx_series,'size', None)}")

    # Build the DataFrame from the Series (avoids the scalar-path constructor)
    idx_df = idx_series.astype(float).rename("w5000").to_frame()  # <— key change
    joined = idx_df.dropna()

    # GDP (quarterly) → forward-filled daily
    gdp_series = fetch_gdp_series()
    gdp_df = pd.DataFrame(gdp_series, columns=["date", "gdp_billion"]).set_index("date").sort_index()
    daily_index = pd.date_range(start=min(gdp_df.index), end=date.today(), freq="D")
    gdp_daily = gdp_df.reindex(daily_index, method="ffill")
    gdp_daily.index = gdp_daily.index.date

    # Join + metrics
    joined["market_cap_billion"] = joined["w5000"] * BILLIONS_PER_POINT
    joined["gdp_billion_saar"] = gdp_daily.loc[joined.index, "gdp_billion"].values
    joined["buffett_ratio"] = joined["market_cap_billion"] / joined["gdp_billion_saar"]

    latest_row = joined.iloc[-1]
    return joined, latest_row, used_ticker


def main():
    series, latest_row, used_ticker = build_series()
    latest = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "w5000_close": round(float(latest_row["w5000"]), 2),
        "billions_per_point": BILLIONS_PER_POINT,
        "market_cap_billion": round(float(latest_row["market_cap_billion"]), 2),
        "gdp_billion_saar": round(float(latest_row["gdp_billion_saar"]), 2),
        "buffett_ratio": round(float(latest_row["buffett_ratio"]), 4),
        "source_ticker": used_ticker,
    }

    hist = [{"date": d.strftime("%Y-%m-%d"), "buffett_ratio": round(float(v), 4)} for d, v in series["buffett_ratio"].items()]

    os.makedirs("data", exist_ok=True)
    with open("data/latest.json", "w") as f:
        json.dump(latest, f, indent=2)
    with open("data/history.json", "w") as f:
        json.dump(hist, f, indent=2)
    print(json.dumps(latest, indent=2))

if __name__ == "__main__":
    main()
