use iced::widget::{column, container, text_input, text};
use iced::{Theme, Element, Error, Alignment, Color, Length, Font, Point};
use iced::theme;
use iced::{keyboard, Event, Subscription, window, mouse, time};
use iced::event;
use plotters::prelude::*;
use plotters::style::Color as PlottersColor;
use plotters_iced::{Chart, ChartWidget, DrawingBackend, ChartBuilder};
use std::path::PathBuf;
use iced::{Task};
use std::time::{Duration, Instant};

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
                selected_data_point: None,
                mouse_position: None,
                last_mouse_update: None,
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
    is_fullscreen: bool,
    selected_data_point: Option<usize>,
    mouse_position: Option<Point>,
    last_mouse_update: Option<Instant>,
}

#[derive(Debug, Clone)]
enum Message {
    TickerInputChanged(String),
    LoadData,
    DataLoaded(Result<Vec<StockData>, String>),
    CloseApp,
    ToggleFullscreen,
    MouseMoved(Point),
    UpdateCrosshairs,
    NoOp,
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
            state.selected_data_point = None;
            Task::none()
        }
        Message::DataLoaded(Err(e)) => {
            eprintln!("Error loading data: {}", e);
            state.stock_data.clear();
            state.price_chart_state.update_data(Vec::new());
            state.volume_chart_state.update_data(Vec::new());
            state.selected_data_point = None;
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
        Message::MouseMoved(position) => {
            // Handle mouse leaving the window (negative coordinates)
            if position.x < 0.0 || position.y < 0.0 {
                state.mouse_position = None;
                state.price_chart_state.set_mouse_position(None);
                state.selected_data_point = None;
                return Task::none();
            }
            
            // Increase throttle threshold to reduce jitter more aggressively
            let should_update = if let Some(last_pos) = state.mouse_position {
                // Only update if mouse moved more than 5 pixels
                let distance = ((position.x - last_pos.x).powi(2) + (position.y - last_pos.y).powi(2)).sqrt();
                distance > 5.0
            } else {
                true
            };
            
            if should_update {
                state.mouse_position = Some(position);
                
                // Update only price chart state with mouse position
                state.price_chart_state.set_mouse_position(Some(position));
                
                // Simplified calculation for data point selection
                if !state.price_chart_state.data.is_empty() {
                    let data_count = state.price_chart_state.data.len();
                    
                    // Use a much simpler approach - assume chart takes most of the window width
                    // with some padding on the sides
                    let chart_left_margin = 60.0;
                    let chart_right_margin = 60.0;
                    let window_width = 1800.0;
                    let chart_width = window_width - chart_left_margin - chart_right_margin;
                    
                    if position.x >= chart_left_margin && position.x <= (window_width - chart_right_margin) {
                        let relative_x = position.x - chart_left_margin;
                        let ratio = relative_x / chart_width;
                        let index = (ratio * data_count as f32) as usize;
                        let clamped_index = index.min(data_count - 1);
                        
                        // Only update if the index actually changed
                        if state.selected_data_point != Some(clamped_index) {
                            state.selected_data_point = Some(clamped_index);
                        }
                    } else {
                        state.selected_data_point = None;
                    }
                }
                state.last_mouse_update = Some(Instant::now());
            }
            Task::none()
        }
        Message::UpdateCrosshairs => {
            // This runs at ~60 FPS to provide smooth updates
            // We can use this to hide crosshairs when mouse hasn't moved for a while
            // or to smooth out any remaining jitter
            Task::none()
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
    
    let status_bar = if let Some(index) = state.selected_data_point {
        if let Some(data_point) = state.price_chart_state.data.get(index) {
            let daily_change = if index > 0 {
                if let Some(prev_data) = state.price_chart_state.data.get(index - 1) {
                    ((data_point.close - prev_data.close) / prev_data.close) * 100.0
                } else {
                    0.0
                }
            } else {
                0.0
            };
            
            let date_str = data_point.timestamp.format("%Y-%m-%d").to_string();
            let status_text = format!(
                "Date: {:>10} | Daily % Gain/Loss: {:>8.2}% | Volume: {:>12.0} | Open: {:>8.2} | High: {:>8.2} | Low: {:>8.2} | Close: {:>8.2}",
                date_str, daily_change, data_point.volume, data_point.open, data_point.high, data_point.low, data_point.close
            );
            
            text(status_text)
                .size(14)
                .font(Font::with_name("JetBrains Mono"))
        } else {
            text("Date:            | Daily % Gain/Loss:         % | Volume:              | Open:         | High:         | Low:          | Close:        ")
                .size(14)
                .font(Font::with_name("JetBrains Mono"))
        }
    } else {
        text("Date:            | Daily % Gain/Loss:         % | Volume:              | Open:         | High:         | Low:          | Close:        ")
            .size(14)
            .font(Font::with_name("JetBrains Mono"))
    };
    
    let content_column = column![
        ticker_input_field,
        price_chart_view,
        volume_chart_view,
        status_bar,
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
    Subscription::batch([
        // Reduced timer frequency to reduce rendering load
        time::every(Duration::from_millis(50)).map(|_| Message::UpdateCrosshairs), // ~20 FPS instead of 60
        
        // Event listener for keyboard and mouse
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
                Event::Mouse(mouse::Event::CursorMoved { position }) => {
                    Message::MouseMoved(position)
                }
                Event::Mouse(mouse::Event::CursorLeft) => {
                    // Hide crosshairs when mouse leaves the window
                    Message::MouseMoved(Point::new(-1.0, -1.0)) // Use invalid coordinates to hide
                }
                _ => Message::NoOp,
            }
        })
    ])
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
    mouse_position: Option<Point>,
    crosshair_visible: bool,
    last_crosshair_index: Option<usize>, // Track last crosshair position to reduce updates
}

impl ChartState {
    fn new(chart_type: ChartType, data: Vec<StockData>) -> Self {
        Self { 
            chart_type, 
            data,
            mouse_position: None,
            crosshair_visible: false,
            last_crosshair_index: None,
        }
    }

    fn update_data(&mut self, new_data: Vec<StockData>) {
        self.data = new_data;
        self.last_crosshair_index = None; // Reset crosshair when data changes
    }
    
    fn set_mouse_position(&mut self, position: Option<Point>) {
        self.mouse_position = position;
        self.crosshair_visible = position.is_some();
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

                // Draw crosshairs if mouse is over the chart
                if self.crosshair_visible {
                    if let Some(mouse_pos) = self.mouse_position {
                        if self.data.len() > 0 {
                            let data_count = self.data.len();
                            
                            // Use the exact same calculation as in mouse tracking
                            let chart_left_margin = 60.0;
                            let chart_right_margin = 60.0;
                            let window_width = 1800.0;
                            let chart_width = window_width - chart_left_margin - chart_right_margin;
                            
                            if mouse_pos.x >= chart_left_margin && mouse_pos.x <= (window_width - chart_right_margin) {
                                let relative_x = mouse_pos.x - chart_left_margin;
                                let ratio = relative_x / chart_width;
                                let data_index = (ratio * data_count as f32) as usize;
                                let data_index = data_index.min(data_count - 1);
                                
                                let x_pos = data_index as f64;
                                let data_point = &self.data[data_index];
                                
                                // Draw vertical crosshair line with semi-transparent white
                                price_chart_context.draw_series(std::iter::once(
                                    PathElement::new(vec![(x_pos, min_low), (x_pos, max_high)], WHITE.mix(0.6).stroke_width(1))
                                )).expect("Failed to draw vertical crosshair");
                                
                                // Draw horizontal crosshair line at close price
                                price_chart_context.draw_series(std::iter::once(
                                    PathElement::new(vec![(0.0, data_point.close), (self.data.len() as f64, data_point.close)], WHITE.mix(0.6).stroke_width(1))
                                )).expect("Failed to draw horizontal crosshair");
                                
                                // Draw a small circle at the intersection point
                                price_chart_context.draw_series(std::iter::once(
                                    Circle::new((x_pos, data_point.close), 2, WHITE.filled())
                                )).expect("Failed to draw crosshair intersection");
                            }
                        }
                    }
                }
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

                // No crosshairs for volume chart - keeps it cleaner
            }
        }
    }
}
