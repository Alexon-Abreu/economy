#!/usr/bin/env python3
import os, json, sys, datetime
from datetime import date, timedelta
import requests
import yfinance as yf
import pandas as pd

FRED_API_KEY = os.environ.get("FRED_API_KEY")
if not FRED_API_KEY:
    print("ERROR: FRED_API_KEY is not set.", file=sys.stderr)
    sys.exit(1)

BILLIONS_PER_POINT = float(os.environ.get("BILLIONS_PER_POINT", "1.05"))
INDEX_TICKERS = ["^FTW5000", "^W5000"]

def fetch_gdp_series():
    url = f"https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key={FRED_API_KEY}&file_type=json"
    r = requests.get(url, timeout=30); r.raise_for_status()
    js = r.json()
    obs = js.get("observations", [])
    gdp = [(o["date"], float(o["value"])) for o in obs if o.get("value") not in (None, ".", "")]
    return [(pd.to_datetime(d).date(), v) for d, v in gdp]

def build_series():
    idx = yf.download(INDEX_TICKERS[0], period="2y", interval="1d", progress=False, auto_adjust=False)
    if idx.empty:
        idx = yf.download(INDEX_TICKERS[1], period="2y", interval="1d", progress=False, auto_adjust=False)
    idx = idx["Close"].dropna()
    idx.index = pd.to_datetime(idx.index).date

    gdp_series = fetch_gdp_series()
    gdp_df = pd.DataFrame(gdp_series, columns=["date", "gdp_billion"]).set_index("date").sort_index()
    daily_index = pd.date_range(start=min(gdp_df.index), end=date.today(), freq="D")
    gdp_daily = gdp_df.reindex(daily_index, method="ffill")
    gdp_daily.index = gdp_daily.index.date

    joined = pd.DataFrame({"w5000": idx}).dropna()
    joined["market_cap_billion"] = joined["w5000"] * BILLIONS_PER_POINT
    joined["gdp_billion_saar"] = gdp_daily.loc[joined.index, "gdp_billion"].values
    joined["buffett_ratio"] = joined["market_cap_billion"] / joined["gdp_billion_saar"]
    latest_row = joined.iloc[-1]
    return joined, latest_row

def main():
    series, latest_row = build_series()
    latest = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "w5000_close": round(float(latest_row["w5000"]), 2),
        "billions_per_point": BILLIONS_PER_POINT,
        "market_cap_billion": round(float(latest_row["market_cap_billion"]), 2),
        "gdp_billion_saar": round(float(latest_row["gdp_billion_saar"]), 2),
        "buffett_ratio": round(float(latest_row["buffett_ratio"]), 4)
    }

    hist = [ {"date": d.strftime("%Y-%m-%d"), "buffett_ratio": round(float(v), 4)} for d, v in series["buffett_ratio"].dropna().items() ]

    os.makedirs("data", exist_ok=True)
    with open("data/latest.json", "w") as f: json.dump(latest, f, indent=2)
    with open("data/history.json", "w") as f: json.dump(hist, f, indent=2)
    print(json.dumps(latest, indent=2))

if __name__ == "__main__":
    main()
