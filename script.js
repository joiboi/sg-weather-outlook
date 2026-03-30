const API_URL = 'https://api-open.data.gov.sg/v2/real-time/api/four-day-outlook';
const PSI_URL = 'https://api-open.data.gov.sg/v2/real-time/api/psi';
const UV_URL = 'https://api-open.data.gov.sg/v2/real-time/api/uv';
const NOW_URL = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast';

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
        'FA': '🌤️', // Fair
    };
    return iconMap[code.toUpperCase()] || iconMap[Object.keys(iconMap).find(k => code.toUpperCase().includes(k))] || '⛅';
};

// Formats the timestamp for the "Last Updated" display
const formatTimestamp = (isoStr) => {
    const date = isoStr ? new Date(isoStr) : new Date();
    return date.toLocaleString('en-SG', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

const updateStatusItem = (id, text, className) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = text;
    el.className = 'status-item ' + (className || '');
};

const fetchEnvironmentalData = async () => {
    try {
        // PSI
        const psiRes = await fetch(PSI_URL);
        if (psiRes.ok) {
            const psiData = await psiRes.json();
            const readings = psiData.data.items[0].readings.psi_twenty_four_hourly;
            const centralPsi = readings.central;
            let psiClass = 'status-good';
            if (centralPsi > 100) psiClass = 'status-unhealthy';
            else if (centralPsi > 50) psiClass = 'status-moderate';
            updateStatusItem('status-psi', `PSI: ${centralPsi}`, psiClass);
        }

        // UV
        const uvRes = await fetch(UV_URL);
        if (uvRes.ok) {
            const uvData = await uvRes.json();
            const latestUv = uvData.data.records[0].index[0].value;
            let uvClass = 'status-good';
            if (latestUv > 7) uvClass = 'status-unhealthy';
            else if (latestUv > 2) uvClass = 'status-moderate';
            updateStatusItem('status-uv', `UV: ${latestUv}`, uvClass);
        }

        // Now (2-hr)
        const nowRes = await fetch(NOW_URL);
        if (nowRes.ok) {
            const nowData = await nowRes.json();
            const forecasts = nowData.data.items[0].forecasts;
            const centralForecast = forecasts.find(f => f.area === 'Central' || f.area === 'City' || f.area.includes('Museum')) || forecasts[0];
            updateStatusItem('status-now', `Now: ${centralForecast.forecast} ${getWeatherIcon(centralForecast.forecast)}`);
        }
    } catch (e) {
        console.warn('Environmental data fetch error:', e);
    }
};

let map;
let mapMarkers = [];

const initMap = () => {
    if (map) return;
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([1.3521, 103.8198], 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
};

const fetchMapData = async () => {
    try {
        const res = await fetch(NOW_URL);
        if (!res.ok) return;
        const data = await res.json();
        const { area_metadata, items } = data.data;
        const forecasts = items[0].forecasts;

        // Clear old markers
        mapMarkers.forEach(m => map.removeLayer(m));
        mapMarkers = [];

        area_metadata.forEach(area => {
            const forecast = forecasts.find(f => f.area === area.name);
            if (!forecast) return;

            const icon = L.divIcon({
                className: 'area-weather-label',
                html: `<div>${area.name}</div><div>${getWeatherIcon(forecast.forecast)}</div>`,
                iconSize: [80, 40]
            });

            const marker = L.marker([area.label_location.latitude, area.label_location.longitude], { icon })
                .bindPopup(`<strong>${area.name}</strong>: ${forecast.forecast}`)
                .addTo(map);
            
            mapMarkers.push(marker);
        });
    } catch (e) {
        console.warn('Map data error:', e);
    }
};

const setupLocateMe = () => {
    const btn = document.getElementById('locate-btn');
    btn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        btn.innerHTML = '📍 Locating...';
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 13);
            
            L.circle([latitude, longitude], {
                radius: 500,
                color: 'var(--accent-blue)',
                fillColor: 'var(--accent-blue)',
                fillOpacity: 0.2
            }).addTo(map).bindPopup('You are here!').openPopup();

            btn.innerHTML = '📍 Relocate';
        }, () => {
            alert('Unable to retrieve your location');
            btn.innerHTML = '📍 Locate Me';
        });
    });
};

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

const RAIN_URL = 'https://api-open.data.gov.sg/v2/real-time/api/rainfall';
const LIGHTNING_URL = 'https://api-open.data.gov.sg/v2/real-time/api/weather?api=lightning';

const checkWeatherAlerts = async () => {
    const banner = document.getElementById('alert-banner');
    const alertText = document.getElementById('alert-text');
    let alerts = [];

    try {
        // Check Rain
        const rainRes = await fetch(RAIN_URL);
        if (rainRes.ok) {
            const rainData = await rainRes.json();
            const readings = rainData.data.items[0].readings;
            const isRaining = readings.some(r => r.value > 0.5); // Threshold for alert
            if (isRaining) alerts.push("Moderate to heavy rain detected.");
        }

        // Check Lightning
        const lightningRes = await fetch(LIGHTNING_URL);
        if (lightningRes.ok) {
            const lightningData = await lightningRes.json();
            const events = lightningData.data.items[0].readings || [];
            if (events.length > 0) alerts.push("Lightning activity spotted.");
        }

        if (alerts.length > 0) {
            alertText.textContent = alerts.join(" ") + " Stay safe!";
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    } catch (e) {
        console.warn('Alerts fetch error:', e);
    }
};

const fetchWeather = async () => {
    const container = document.getElementById('forecast-container');
    const updateTime = document.getElementById('last-updated');
    
    // Initialize Map and Locating
    initMap();
    fetchMapData();
    setupLocateMe();

    // Launch environmental fetches in background
    fetchEnvironmentalData();
    checkWeatherAlerts();

    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API unstable');
        
        const jsonData = await response.json();
        const latestRecord = jsonData.data.records[0];
        const forecasts = latestRecord.forecasts;
        
        container.innerHTML = '';
        updateTime.textContent = `Last synchronized: ${formatTimestamp(latestRecord.updatedTimestamp)}`;
        
        forecasts.slice(0, 4).forEach((forecast, index) => {
            const card = createForecastCard(forecast);
            card.style.animationDelay = `${index * 0.1}s`;
            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error fetching weather data:', error);
        container.innerHTML = '<div class="loader"><p>Connection trouble. Retrying...</p></div>';
    }
};

// Initial Fetch
document.addEventListener('DOMContentLoaded', fetchWeather);

// Refresh everything every 15 minutes
setInterval(fetchWeather, 15 * 60 * 1000);
