#!/usr/bin/env python3

import os
import sys

import yfinance as yf


def download_ticker_data(ticker_symbol=None):
    # Get ticker input from command line argument or user input
    if ticker_symbol is None:
        if len(sys.argv) > 1:
            ticker_symbol = sys.argv[1].upper()
        else:
            ticker_symbol = input("Enter the ticker symbol: ").upper()
    else:
        ticker_symbol = ticker_symbol.upper()

    try:
        # Create a Ticker object
        ticker = yf.Ticker(ticker_symbol)

        # Get company information
        info = ticker.info

        if not info or "shortName" not in info:
            print(
                f"Could not retrieve information for ticker {ticker_symbol}. Please check the symbol and try again."
            )
            return False

        # If called from command line with ticker argument, skip confirmation
        if len(sys.argv) > 1:
            print(f"\nUpdating data for {ticker_symbol}...")
        else:
            # Display company information for confirmation
            print("\n--- Company Information ---")
            print(f"Name: {info.get('shortName', 'N/A')}")
            print(f"Symbol: {info.get('symbol', 'N/A')}")
            print(f"Exchange: {info.get('exchange', 'N/A')}")
            print(f"Industry: {info.get('industry', 'N/A')}")
            print(f"Sector: {info.get('sector', 'N/A')}")
            print(f"Website: {info.get('website', 'N/A')}")
            print("---------------------------\n")

            confirm = input(
                f"Is this the correct company you are interested in for {ticker_symbol}? (yes/no): "
            ).lower()

            if confirm != "yes":
                if confirm == "no":
                    print("Operation cancelled by the user.")
                else:
                    print("Invalid input. Please enter 'yes' or 'no'.")
                return False

        # Download historical data (OHLCV)
        print(f"Downloading historical data for {ticker_symbol}...")
        hist_data = ticker.history(
            period="max")  # "max" downloads all available data

        if hist_data.empty:
            print(f"No historical data found for {ticker_symbol}.")
            return False

        # Define the folder and filename
        folder_name = "historical_data"
        if not os.path.exists(folder_name):
            os.makedirs(folder_name)

        file_name = f"{ticker_symbol}.csv"
        file_path = os.path.join(folder_name, file_name)

        # Save the data to a CSV file
        hist_data.to_csv(file_path)
        print(f"Historical data saved to {file_path}")
        return True

    except Exception as e:
        print(f"An error occurred: {e}")
        print(
            "Please ensure you have the 'yfinance' and 'pandas' libraries installed."
        )
        print("You can install them using: pip install yfinance pandas")
        return False


if __name__ == "__main__":
    download_ticker_data()
