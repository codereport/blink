#!/usr/bin/env python3

import os
import sys
import time
import pandas as pd
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from typing import List, Tuple
import json


def get_top_nasdaq_stocks(count: int = 200) -> List[str]:
    """
    Load NASDAQ tickers from nasdaq_tickers.txt file.
    """
    ticker_file = "nasdaq_tickers.txt"

    if not os.path.exists(ticker_file):
        print(f"Error: {ticker_file} not found!")
        print("Please create a nasdaq_tickers.txt file with one ticker per line.")
        return []

    # Read tickers from file
    tickers = []
    try:
        with open(ticker_file, "r") as f:
            for line in f:
                line = line.strip()
                # Skip empty lines and comments
                if line and not line.startswith("#"):
                    tickers.append(line.upper())

        print(f"Loaded {len(tickers)} tickers from {ticker_file}")

        if len(tickers) < count:
            print(f"Note: Found {len(tickers)} tickers, will download all available.")
            return tickers

        return tickers[:count]

    except Exception as e:
        print(f"Error reading {ticker_file}: {e}")
        return []


def download_single_ticker(
    ticker: str, folder_name: str = "historical_data"
) -> Tuple[str, bool, str]:
    """
    Download historical data for a single ticker.
    Returns: (ticker, success, message)
    """
    try:
        # Create folder if it doesn't exist
        if not os.path.exists(folder_name):
            os.makedirs(folder_name)

        file_path = os.path.join(folder_name, f"{ticker}.csv")

        # Skip if file already exists and is recent (less than 1 day old)
        if os.path.exists(file_path):
            file_age = time.time() - os.path.getmtime(file_path)
            if file_age < 86400:  # 24 hours
                return ticker, True, "Already exists (recent)"

        # Create ticker object and download data
        stock = yf.Ticker(ticker)
        hist_data = stock.history(period="max")

        if hist_data.empty:
            return ticker, False, "No data available"

        # Save to CSV
        hist_data.to_csv(file_path)
        return ticker, True, f"Downloaded {len(hist_data)} records"

    except Exception as e:
        return ticker, False, f"Error: {str(e)}"


def download_nasdaq_200_bulk(max_workers: int = 10):
    """
    Download historical data for NASDAQ stocks with parallel processing.
    """
    print("=== NASDAQ Stocks Historical Data Downloader ===\n")

    # Get the list of tickers
    tickers = get_top_nasdaq_stocks(200)
    print(f"Found {len(tickers)} tickers to process\n")

    # Download with progress tracking
    successful = []
    failed = []

    print(f"Starting parallel download with {max_workers} workers...\n")
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all download tasks
        future_to_ticker = {
            executor.submit(download_single_ticker, ticker): ticker
            for ticker in tickers
        }

        # Process completed downloads
        for i, future in enumerate(as_completed(future_to_ticker), 1):
            ticker = future_to_ticker[future]
            ticker_result, success, message = future.result()

            if success:
                successful.append(ticker_result)
                status = "✓"
            else:
                failed.append((ticker_result, message))
                status = "✗"

            # Progress update
            progress = (i / len(tickers)) * 100
            print(f"[{progress:5.1f}%] {status} {ticker_result:6} - {message}")

    # Summary
    elapsed_time = time.time() - start_time
    print(f"\n=== Download Summary ===")
    print(f"Total processed: {len(tickers)}")
    print(f"Successful: {len(successful)}")
    print(f"Failed: {len(failed)}")
    print(f"Time elapsed: {elapsed_time:.1f} seconds")
    print(f"Average time per ticker: {elapsed_time/len(tickers):.2f} seconds")

    if failed:
        print(f"\n=== Failed Downloads ===")
        for ticker, reason in failed:
            print(f"  {ticker}: {reason}")

    print(f"\nHistorical data saved to: ./historical_data/")
    return successful, failed


def main():
    """Main function to run the script."""

    # Parse command line arguments
    max_workers = 10

    if len(sys.argv) > 1:
        try:
            max_workers = int(sys.argv[1])
        except ValueError:
            print("Invalid max_workers argument. Using default: 10")

    print(f"Configuration:")
    print(f"  Max workers: {max_workers}")
    print()

    # Run the bulk download
    try:
        successful, failed = download_nasdaq_200_bulk(max_workers)

        if successful:
            print(f"\n✓ Successfully downloaded data for {len(successful)} stocks!")

        if failed:
            print(f"\n⚠ {len(failed)} downloads failed. You can retry these manually.")

    except KeyboardInterrupt:
        print("\n\nDownload interrupted by user.")
    except Exception as e:
        print(f"\nAn error occurred: {e}")
        print("Please ensure you have the required libraries installed:")
        print("pip install yfinance pandas requests")


if __name__ == "__main__":
    main()
