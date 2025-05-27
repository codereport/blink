use iced::widget::{column, container, text_input};
use iced::{Theme, Element, Error, Alignment, Color, Length, Font};
use iced::theme;
use iced::{keyboard, Event, Subscription, window};
use iced::event;
use plotters::prelude::*;
use plotters::style::Color as PlottersColor;
use plotters_iced::{Chart, ChartWidget, DrawingBackend, ChartBuilder};
use std::path::PathBuf;
use iced::{Task};

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

// Main function using iced::Application trait
fn main() -> Result<(), Error> {
    iced::application("Stock Screener", update, view)
        .theme(theme)
        .subscription(subscription)
        .run_with(|| {
            let initial_state = StockScreener {
                ticker_input: "NVDA".to_string(),
                stock_data: Vec::new(),
                price_chart_state: ChartState::new(ChartType::Price, Vec::new()),
                volume_chart_state: ChartState::new(ChartType::Volume, Vec::new()),
                is_fullscreen: false,
            };
            let initial_task = Task::perform(
                load_stock_data("NVDA".to_string()),
                Message::DataLoaded,
            );
            (initial_state, initial_task)
        })
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
    is_fullscreen: bool, // To track fullscreen state
}

#[derive(Debug, Clone)]
enum Message {
    TickerInputChanged(String),
    LoadData,
    DataLoaded(Result<Vec<StockData>, String>),
    CloseApp, // For Ctrl+Q/W
    ToggleFullscreen, // For F11
    NoOp, // New variant for unhandled events
}

// Update function for the new Program API
fn update(state: &mut StockScreener, message: Message) -> Task<Message> {
    match message {
        Message::TickerInputChanged(input) => {
            state.ticker_input = input;
            Task::none()
        }
        Message::LoadData => {
            let ticker = state.ticker_input.to_uppercase();
            Task::perform(load_stock_data(ticker), Message::DataLoaded)
        }
        Message::DataLoaded(Ok(data)) => {
            state.stock_data = data;
            let mut chart_data = Vec::new();
            if !state.stock_data.is_empty() {
                let six_months_ago = chrono::Utc::now() - chrono::Duration::days(6 * 30);
                chart_data = state.stock_data.iter()
                    .filter(|d| d.timestamp >= six_months_ago)
                    .cloned()
                    .collect();
            }
            state.price_chart_state.update_data(chart_data.clone());
            state.volume_chart_state.update_data(chart_data);
            Task::none()
        }
        Message::DataLoaded(Err(e)) => {
            eprintln!("Error loading data: {}", e);
            state.stock_data.clear();
            state.price_chart_state.update_data(Vec::new());
            state.volume_chart_state.update_data(Vec::new());
            Task::none()
        }
        Message::CloseApp => {
            iced::exit()
        }
        Message::ToggleFullscreen => {
            state.is_fullscreen = !state.is_fullscreen;
            let new_mode = if state.is_fullscreen {
                window::Mode::Fullscreen
            } else {
                window::Mode::Windowed
            };
            window::get_latest().and_then(move |id| window::change_mode(id, new_mode))
        }
        Message::NoOp => Task::none(),
    }
}

// View function for the new Program API
fn view(state: &StockScreener) -> Element<Message> {
    let ticker_input_field = text_input("Enter Ticker (e.g., AAPL)", &state.ticker_input)
        .on_input(Message::TickerInputChanged)
        .on_submit(Message::LoadData)
        .padding(10)
        .font(Font::with_name("JetBrains Mono"));

    let price_chart_view = ChartWidget::new(&state.price_chart_state)
        .width(Length::Fill)
        .height(Length::FillPortion(8));
    
    let volume_chart_view = ChartWidget::new(&state.volume_chart_state)
        .width(Length::Fill)
        .height(Length::FillPortion(2));
    
    let content_column = column![
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
        .center_x(Length::Fill)
        .center_y(Length::Fill)
        .into()
}

// Theme function for the new Program API
fn theme(_state: &StockScreener) -> Theme {
    Theme::custom("Dark".to_string(), theme::Palette {
        background: Color::BLACK,
        text: Color::from_rgb(0.7, 0.7, 0.7),
        primary: Color::from_rgb(0.5, 0.5, 0.5),
        success: Color::from_rgb(0.0, 1.0, 0.0),
        danger: Color::from_rgb(1.0, 0.0, 0.0),
    })
}

// Subscription function for the new Program API
fn subscription(_state: &StockScreener) -> Subscription<Message> {
    event::listen().map(|event| {
        match event {
            Event::Keyboard(keyboard::Event::KeyPressed {
                key,
                modifiers,
                ..
            }) => {
                if modifiers.control() {
                    match key.as_ref() {
                        keyboard::Key::Character("q") | keyboard::Key::Character("w") => Message::CloseApp,
                        _ => Message::NoOp,
                    }
                } else if modifiers.is_empty() {
                    match key.as_ref() {
                        keyboard::Key::Named(keyboard::key::Named::F11) => Message::ToggleFullscreen,
                        _ => Message::NoOp,
                    }
                } else {
                    Message::NoOp
                }
            }
            _ => Message::NoOp,
        }
    })
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
            let mut chart = chart_builder
                .margin(5)
                .build_cartesian_2d(0f32..10f32, 0f32..10f32)
                .expect("Failed to build chart");
            chart.configure_mesh()
                .set_all_tick_mark_size(0)
                .axis_style(WHITE.mix(0.2))
                .draw().expect("Failed to draw mesh");
            return;
        }

        let x_range = 0.0..(self.data.len() as f64);

        match self.chart_type {
            ChartType::Price => {
                let (min_low, max_high) = self.data.iter()
                    .map(|d| (d.low, d.high))
                    .fold((self.data[0].low, self.data[0].high), |(min_l, max_h), (l, h)| (min_l.min(l), max_h.max(h)));

                let mut price_chart_context = chart_builder
                    .margin(5)
                    .build_cartesian_2d(x_range.clone(), min_low..max_high)
                    .expect("Failed to build price chart");

                price_chart_context.configure_mesh()
                    .set_all_tick_mark_size(0)
                    .disable_x_mesh()
                    .axis_style(BLACK)
                    .bold_line_style(WHITE.mix(0.05).stroke_width(1))
                    .draw().expect("Failed to draw price mesh");

                price_chart_context.draw_series(self.data.iter().enumerate().map(|(idx, data)| {
                    let x = idx as f64;
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
                    .build_cartesian_2d(x_range.clone(), 0.0..max_volume)
                    .expect("Failed to build volume chart");

                volume_chart_context.configure_mesh()
                    .set_all_tick_mark_size(0)
                    .disable_x_mesh()
                    .axis_style(BLACK)
                    .draw().expect("Failed to draw volume mesh");

                volume_chart_context.draw_series(self.data.iter().enumerate().map(|(idx, data)| {
                    let x = idx as f64;
                    let color = if data.close >= data.open { GREEN.mix(0.5) } else { RED.mix(0.5) };
                    let bar_width = 0.8f64;
                    Rectangle::new([
                        (x - bar_width / 2.0, 0.0),
                        (x + bar_width / 2.0, data.volume)
                    ], color.filled())
                })).expect("Failed to draw volume series");
            }
        }
    }
}
