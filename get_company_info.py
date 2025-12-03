#!/usr/bin/env python3
"""Fetch company info from Yahoo Finance and output as JSON."""

import json
import sys

import yfinance as yf


def get_company_info(ticker_symbol: str) -> dict:
    """Get company name, industry, and description for a ticker."""
    try:
        ticker = yf.Ticker(ticker_symbol.upper())
        info = ticker.info

        if not info or "shortName" not in info:
            return {"error": f"Could not find company info for {ticker_symbol}"}

        # Get a short description - truncate if too long
        description = info.get("longBusinessSummary", "")
        if len(description) > 500:
            # Truncate at last sentence boundary before 500 chars
            truncated = description[:500]
            last_period = truncated.rfind(".")
            if last_period > 200:
                description = truncated[: last_period + 1]
            else:
                description = truncated + "..."

        return {
            "ticker": ticker_symbol.upper(),
            "name": info.get("shortName") or info.get("longName", "N/A"),
            "industry": info.get("industry", "N/A"),
            "sector": info.get("sector", "N/A"),
            "description": description,
        }

    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No ticker symbol provided"}))
        sys.exit(1)

    ticker = sys.argv[1]
    result = get_company_info(ticker)
    print(json.dumps(result))

