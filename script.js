const API_URL = 'https://api-open.data.gov.sg/v2/real-time/api/four-day-outlook';

// Helper function to map weather codes to emoji/icons
const getWeatherIcon = (code) => {
    const iconMap = {
        'PC': '⛅', // Partly Cloudy
        'PS': '🌦️', // Passing Showers
        'TS': '⛈️', // Thundery Showers
        'CL': '☀️', // Clear
        'CD': '☁️', // Cloudy
        'HR': '🌧️', // Heavy Rain
        'LR': '🌦️', // Light Rain
        'SW': '🏖️', // Sunny
    };
    return iconMap[code] || '⛅';
};

// Formats the timestamp for the "Last Updated" display
const formatTimestamp = (isoStr) => {
    const date = new Date(isoStr);
    return date.toLocaleString('en-SG', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

// Mock data in case the API is down or rate-limited
const getMockData = () => ({
    data: {
        records: [{
            updatedTimestamp: new Date().toISOString(),
            forecasts: [
                { day: 'Friday', forecast: { text: 'Partly Cloudy', code: 'PC' }, temperature: { low: 26, high: 33 }, relativeHumidity: { low: 65, high: 90 }, wind: { direction: 'SSW', speed: { low: 10, high: 20 } } },
                { day: 'Saturday', forecast: { text: 'Thundery Showers', code: 'TS' }, temperature: { low: 25, high: 32 }, relativeHumidity: { low: 70, high: 95 }, wind: { direction: 'W', speed: { low: 15, high: 25 } } },
                { day: 'Sunday', forecast: { text: 'Passing Showers', code: 'PS' }, temperature: { low: 26, high: 34 }, relativeHumidity: { low: 60, high: 85 }, wind: { direction: 'SW', speed: { low: 5, high: 15 } } },
                { day: 'Monday', forecast: { text: 'Cloudy', code: 'CD' }, temperature: { low: 24, high: 30 }, relativeHumidity: { low: 75, high: 100 }, wind: { direction: 'N', speed: { low: 10, high: 20 } } }
            ]
        }]
    }
});

const createForecastCard = (forecast) => {
    const { day, forecast: weather, temperature, relativeHumidity, wind } = forecast;
    const card = document.createElement('div');
    card.className = 'forecast-card';
    
    card.innerHTML = `
        <div class="card-header">
            <span class="day-name">${day}</span>
            <span class="date-text">${weather.text}</span>
        </div>
        <div class="weather-icon-container">
            <span style="font-size: 3rem;">${getWeatherIcon(weather.code)}</span>
        </div>
        <div class="weather-status">${weather.text}</div>
        <div class="temp-range">
            <div class="temp-item">
                <span class="temp-val">${temperature.high}°C</span>
                <span class="temp-label">High</span>
            </div>
            <div class="temp-item" style="opacity: 0.5;">
                <span class="temp-val">|</span>
            </div>
            <div class="temp-item">
                <span class="temp-val">${temperature.low}°C</span>
                <span class="temp-label">Low</span>
            </div>
        </div>
        <div class="meta-info">
            <div class="meta-item">
                <span class="meta-label">Humidity</span>
                <span class="meta-val">${relativeHumidity.low}% - ${relativeHumidity.high}%</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">Wind</span>
                <span class="meta-val">${wind.direction} ${wind.speed.low}-${wind.speed.high} km/h</span>
            </div>
        </div>
    `;
    return card;
};

const fetchWeather = async () => {
    const container = document.getElementById('forecast-container');
    const updateTime = document.getElementById('last-updated');
    
    try {
        const response = await fetch(API_URL);
        
        let jsonData;
        if (!response.ok) {
            console.warn('API fetch failed, using mock data for demonstration.');
            jsonData = getMockData();
        } else {
            jsonData = await response.json();
        }

        const latestRecord = jsonData.data.records[0];
        const forecasts = latestRecord.forecasts;
        
        // Clear container and update time
        container.innerHTML = '';
        updateTime.textContent = `Last synchronized: ${formatTimestamp(latestRecord.updatedTimestamp)}`;
        
        // Populate forecast cards
        forecasts.slice(0, 4).forEach((forecast, index) => {
            const card = createForecastCard(forecast);
            card.style.animationDelay = `${index * 0.1}s`;
            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error fetching weather data:', error);
        container.innerHTML = `
            <div class="loader">
                <p style="color: var(--accent-sunset);">Failed to load weather data. Using cached view.</p>
            </div>
        `;
        // Fallback to mock data on network error
        const mockData = getMockData();
        const forecasts = mockData.data.records[0].forecasts;
        container.innerHTML = '';
        forecasts.forEach(forecast => {
            container.appendChild(createForecastCard(forecast));
        });
    }
};

// Initial Fetch
document.addEventListener('DOMContentLoaded', fetchWeather);

// Refresh every 30 minutes
setInterval(fetchWeather, 30 * 60 * 1000);
