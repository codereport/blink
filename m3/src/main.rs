use iced::widget::{column, container, text_input, Column};
use iced::{Theme, Element, Length, Settings, Task, Error, Alignment, Renderer};
use plotters::prelude::*;
use plotters_iced::{Chart, ChartWidget, DrawingBackend, ChartBuilder};
use std::path::PathBuf;

// Custom deserialization for the timestamp
mod custom_date_format {
    use chrono::{DateTime, Utc};
    use serde::{self, Deserialize, Deserializer};

    const FORMAT: &str = "%Y-%m-%d %H:%M:%S%z";

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        DateTime::parse_from_str(&s, FORMAT)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(serde::de::Error::custom)
    }
}

// Define a struct to hold OHLCV data
#[derive(Debug, Clone, serde::Deserialize)]
struct StockData {
    #[serde(with = "custom_date_format", rename = "Date")]
    timestamp: chrono::DateTime<chrono::Utc>,
    #[serde(rename = "Open")]
    open: f64,
    #[serde(rename = "High")]
    high: f64,
    #[serde(rename = "Low")]
    low: f64,
    #[serde(rename = "Close")]
    close: f64,
    #[serde(rename = "Volume")]
    volume: f64,
}

// Main function using iced::application
fn main() -> Result<(), Error> {
    iced::application("Stock Screener", StockScreener::update, StockScreener::view)
        .settings(Settings {
            antialiasing: true,
            ..Settings::default()
        })
        .theme(StockScreener::theme)
        .run_with(|| (StockScreener::new(), Task::none()))
}

#[derive(Debug, Clone, Copy)]
enum ChartType {
    Price,
    Volume,
}

struct StockScreener {
    ticker_input: String,
    stock_data: Vec<StockData>,
    price_chart_state: ChartState,
    volume_chart_state: ChartState,
    current_theme: Theme,
}

#[derive(Debug, Clone)]
enum Message {
    TickerInputChanged(String),
    LoadData,
    DataLoaded(Result<Vec<StockData>, String>),
}

impl StockScreener {
    fn new() -> Self {
        Self {
            ticker_input: String::new(),
            stock_data: Vec::new(),
            price_chart_state: ChartState::new(ChartType::Price, Vec::new()),
            volume_chart_state: ChartState::new(ChartType::Volume, Vec::new()),
            current_theme: Theme::Dark,
        }
    }

    fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::TickerInputChanged(input) => {
                self.ticker_input = input;
                Task::none()
            }
            Message::LoadData => {
                let ticker = self.ticker_input.to_uppercase();
                Task::perform(load_stock_data(ticker), Message::DataLoaded)
            }
            Message::DataLoaded(Ok(data)) => {
                self.stock_data = data;
                let mut chart_data = Vec::new();
                if !self.stock_data.is_empty() {
                    let six_months_ago = chrono::Utc::now() - chrono::Duration::days(6 * 30);
                    chart_data = self.stock_data.iter()
                        .filter(|d| d.timestamp >= six_months_ago)
                        .cloned()
                        .collect();
                }
                self.price_chart_state.update_data(chart_data.clone());
                self.volume_chart_state.update_data(chart_data);
                Task::none()
            }
            Message::DataLoaded(Err(e)) => {
                eprintln!("Error loading data: {}", e);
                self.stock_data.clear();
                self.price_chart_state.update_data(Vec::new());
                self.volume_chart_state.update_data(Vec::new());
                Task::none()
            }
        }
    }

    fn view(&self) -> Element<'_, Message, Theme, Renderer> {
        let ticker_input_field = text_input("Enter Ticker (e.g., AAPL)", &self.ticker_input)
            .on_input(Message::TickerInputChanged)
            .on_submit(Message::LoadData)
            .padding(10);

        let price_chart_view = ChartWidget::new(&self.price_chart_state)
            .width(Length::Fill)
            .height(Length::FillPortion(7));
        
        let volume_chart_view = ChartWidget::new(&self.volume_chart_state)
            .width(Length::Fill)
            .height(Length::FillPortion(3));
        
        let content_column: Column<Message, Theme, Renderer> = column![
            ticker_input_field,
            price_chart_view,
            volume_chart_view,
        ]
        .spacing(20)
        .padding(20)
        .align_x(Alignment::Center);

        container(content_column)
            .width(Length::Fill)
            .height(Length::Fill)
            .align_x(Alignment::Center)
            .align_y(Alignment::Center)
            .into()
    }

    fn theme(&self) -> Theme {
        self.current_theme.clone()
    }
}

// Asynchronous function to load stock data
async fn load_stock_data(ticker: String) -> Result<Vec<StockData>, String> {
    // Construct the file path. Ensure your `historical_prices` directory is in the correct location.
    // For example, if it's in the project root:
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // Go up to the parent directory (the project root)
    path.push("historical_data"); // Changed "historical_prices" to "historical_data"
    path.push(format!("{}.csv", ticker));

    if !path.exists() {
        return Err(format!("Data file not found for ticker: {}", ticker));
    }

    let mut rdr = csv::Reader::from_path(path).map_err(|e| e.to_string())?;
    let mut data = Vec::new();
    for result in rdr.deserialize() {
        let record: StockData = result.map_err(|e| e.to_string())?;
        data.push(record);
    }
    // Sort data by timestamp if it's not already sorted
    data.sort_by_key(|d| d.timestamp);
    Ok(data)
}

struct ChartState {
    chart_type: ChartType,
    data: Vec<StockData>,
}

impl ChartState {
    fn new(chart_type: ChartType, data: Vec<StockData>) -> Self {
        Self { chart_type, data }
    }

    fn update_data(&mut self, new_data: Vec<StockData>) {
        self.data = new_data;
    }
}

impl Chart<Message> for ChartState {
    type State = ();

    fn build_chart<DB: DrawingBackend>(&self, _state: &Self::State, mut chart_builder: ChartBuilder<DB>) {
        if self.data.is_empty() {
            let caption = match self.chart_type {
                ChartType::Price => "Price Data Not Available",
                ChartType::Volume => "Volume Data Not Available",
            };
            let mut chart = chart_builder
                .caption(caption, ("sans-serif", 20).into_font())
                .margin(5)
                .set_all_label_area_size(50) 
                .build_cartesian_2d(0f32..10f32, 0f32..10f32)
                .expect("Failed to build chart");
            chart.configure_mesh().draw().expect("Failed to draw mesh");
            return;
        }

        let (min_date, max_date) = self.data.iter()
            .map(|d| d.timestamp)
            .fold((self.data[0].timestamp, self.data[0].timestamp), |(min, max), ts| (min.min(ts), max.max(ts)));

        match self.chart_type {
            ChartType::Price => {
                let (min_low, max_high) = self.data.iter()
                    .map(|d| (d.low, d.high))
                    .fold((self.data[0].low, self.data[0].high), |(min_l, max_h), (l, h)| (min_l.min(l), max_h.max(h)));

                let mut price_chart_context = chart_builder
                    .margin(5)
                    .set_all_label_area_size(50)
                    .caption("Stock Price", ("sans-serif", 20).into_font())
                    .build_cartesian_2d(min_date..max_date, min_low..max_high)
                    .expect("Failed to build price chart");

                price_chart_context.configure_mesh()
                    .x_labels(5)
                    .y_labels(5)
                    .y_label_formatter(&|y| format!("${:.2}", y))
                    .draw().expect("Failed to draw price mesh");

                price_chart_context.draw_series(self.data.iter().map(|data| {
                    let x = data.timestamp;
                    let open = data.open;
                    let high = data.high;
                    let low = data.low;
                    let close = data.close;
                    let color = if close >= open { GREEN } else { RED };
                    CandleStick::new(x, open, high, low, close, color.filled(), color, 10)
                })).expect("Failed to draw candlestick series");
            }
            ChartType::Volume => {
                let max_volume = self.data.iter().map(|d| d.volume).fold(0.0, f64::max);

                let mut volume_chart_context = chart_builder
                    .margin(5)
                    .set_all_label_area_size(50)
                    // No caption for volume chart to save space, or add a very small one
                    .build_cartesian_2d(min_date..max_date, 0.0..max_volume)
                    .expect("Failed to build volume chart");

                volume_chart_context.configure_mesh()
                    .x_labels(5) 
                    .y_labels(3)
                    .y_label_formatter(&|v| { 
                        if *v >= 1_000_000_000.0 {
                            format!("{:.1}B", *v / 1_000_000_000.0)
                        } else if *v >= 1_000_000.0 {
                            format!("{:.1}M", *v / 1_000_000.0)
                        } else if *v >= 1_000.0 {
                            format!("{:.1}K", *v / 1_000.0)
                        } else {
                            format!("{:.0}", *v)
                        }
                    })
                    .draw().expect("Failed to draw volume mesh");

                volume_chart_context.draw_series(self.data.iter().map(|data| {
                    let x = data.timestamp;
                    let color = if data.close >= data.open { GREEN.mix(0.5) } else { RED.mix(0.5) };
                    let bar_width_duration = chrono::Duration::hours(12);
                    Rectangle::new([(x - bar_width_duration, 0.0), (x + bar_width_duration, data.volume)], color.filled())
                })).expect("Failed to draw volume series");
            }
        }
    }
}
