const API_URL = 'https://api-open.data.gov.sg/v2/real-time/api/four-day-outlook';
const PSI_URL = 'https://api-open.data.gov.sg/v2/real-time/api/psi';
const UV_URL = 'https://api-open.data.gov.sg/v2/real-time/api/uv';
const NOW_URL = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast';
const TEMP_URL = 'https://api-open.data.gov.sg/v2/real-time/api/weather?api=air-temperature';
const RAIN_URL = 'https://api-open.data.gov.sg/v2/real-time/api/rainfall';
const LIGHTNING_URL = 'https://api-open.data.gov.sg/v2/real-time/api/weather?api=lightning';

// Global Map instances
let map;
let mapMarkers = [];

// Improved Icon Mapping
const getWeatherIcon = (code) => {
    const iconMap = {
        'PC': '⛅', // Partly Cloudy
        'PS': '🌦️', // Passing Showers
        'TS': '⛈️', // Thundery Showers
        'CL': '☀️', // Clear
        'CD': '☁️', // Cloudy
        'OC': '☁️', // Overcast
        'RA': '🌧️', // Rain
        'LR': '🌦️', // Light Rain
        'HR': '🌧️', // Heavy Rain
        'SW': '🏖️', // Sunny
        'FA': '☀️', // Fair
    };
    const cleanCode = code.toUpperCase().trim();
    if (iconMap[cleanCode]) return iconMap[cleanCode];

    if (cleanCode.includes('THUNDERY')) return '⛈️';
    if (cleanCode.includes('CLOUDY')) return '☁️';
    if (cleanCode.includes('PARTLY CLOUDY')) return '⛅';
    if (cleanCode.includes('SHOWER')) return '🌦️';
    if (cleanCode.includes('RAIN')) return '🌧️';
    if (cleanCode.includes('FAIR') || cleanCode.includes('CLEAR')) return '☀️';

    return '⛅';
};

const getRegion = (area) => {
    const mapping = {
        'north': ['Admiralty', 'Kranji', 'Woodlands', 'Sembawang', 'Yishun', 'Sungei Kadut', 'Mandai'],
        'south': ['Bukit Merah', 'Queenstown', 'Telok Blangah', 'City', 'Sentosa', 'Southern Islands'],
        'east': ['Bedok', 'Changi', 'Pasir Ris', 'Paya Lebar', 'Tampines', 'Pulau Ubin', 'Pulau Tekong'],
        'west': ['Bukit Batok', 'Bukit Panjang', 'Choa Chu Kang', 'Clementi', 'Jurong East', 'Jurong West', 'Pioneer', 'Tengah', 'Tuas', 'Western Islands', 'Western Water Catchment', 'Boon Lay', 'Jurong Island'],
        'central': ['Ang Mo Kio', 'Bishan', 'Bukit Timah', 'Geylang', 'Hougang', 'Kallang', 'Marine Parade', 'Newton', 'Novena', 'Orchard', 'Outram', 'Serangoon', 'Tanglin', 'Toa Payoh', 'Punggol', 'Sengkang', 'Whampoa', 'Tiong Bahru']
    };
    for (const [region, areas] of Object.entries(mapping)) {
        if (areas.some(a => area.includes(a))) return region;
    }
    return 'central';
};

const formatTimestamp = (isoStr) => {
    const date = isoStr ? new Date(isoStr) : new Date();
    return date.toLocaleString('en-SG', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
};

const updateStatusItem = (id, text, className) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = text;
    if (className) el.className = 'status-item ' + className;
};

// Map & Geolocation Initialization
const initMap = () => {
    if (map) return;
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([1.3521, 103.8198], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
};

const fetchMapData = async () => {
    try {
        const res = await fetch(NOW_URL);
        if (!res.ok) return;
        const nowData = (await res.json()).data;
        const forecasts = nowData.items[0].forecasts;
        
        mapMarkers.forEach(m => map.removeLayer(m));
        mapMarkers = [];

        nowData.area_metadata.forEach(area => {
            const forecast = forecasts.find(f => f.area === area.name);
            if (!forecast) return;

            const icon = L.divIcon({
                className: 'area-weather-label',
                html: `<div>${getWeatherIcon(forecast.forecast)}</div>`,
                iconSize: [30, 30]
            });

            const marker = L.marker([area.label_location.latitude, area.label_location.longitude], { icon })
                .bindPopup(`
                    <div id="popup-${area.name.replace(/\s+/g, '-')}" style="font-family: inherit; min-width: 120px;">
                        <strong style="font-size: 1.1rem; color: var(--accent-blue);">${area.name}</strong><br/>
                        <div style="margin-top: 5px; color: var(--text-secondary);">✨ ${forecast.forecast}</div>
                        <div class="popup-loading" style="font-size: 0.8rem; margin-top: 5px; opacity: 0.6;">Loading latest details...</div>
                    </div>
                `)
                .addTo(map);

            // Fetch details only when clicked
            marker.on('click', async () => {
                const popupId = `popup-${area.name.replace(/\s+/g, '-')}`;
                const popupEl = document.getElementById(popupId);
                if (!popupEl || popupEl.querySelector('.popup-details')) return;

                try {
                    const [psiRes, uvRes, tempRes] = await Promise.all([
                        fetch(PSI_URL), fetch(UV_URL), fetch(TEMP_URL)
                    ]);

                    const regionalPsi = (await psiRes.json()).data.items[0].readings.psi_twenty_four_hourly;
                    const currentUv = (await uvRes.json()).data.records[0].index[0].value;
                    const temps = (await tempRes.json()).data.items[0].readings;

                    const region = getRegion(area.name);
                    const psi = regionalPsi[region] || '--';
                    const areaTemp = temps.find(t => t.stationId.includes(area.name.substring(0, 4))) || temps[0];

                    const detailsHtml = `
                        <div class="popup-details" style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; line-height: 1.5;">
                            <span>🌡️ Temp: ${areaTemp ? areaTemp.value : '--'}°C</span><br/>
                            <span>😷 PSI: ${psi}</span><br/>
                            <span>☀️ UV: ${currentUv}</span>
                        </div>
                    `;
                    
                    const loadingEl = popupEl.querySelector('.popup-loading');
                    if (loadingEl) loadingEl.remove();
                    popupEl.innerHTML += detailsHtml;
                    
                } catch (err) {
                    console.warn('Click fetch error:', err);
                }
            });
            
            mapMarkers.push(marker);
        });
    } catch (e) {
        console.warn('Map data error:', e);
    }
};

const setupLocateMe = () => {
    const btn = document.getElementById('locate-btn');
    if (!btn) return;
    btn.onclick = () => {
        if (!navigator.geolocation) return alert('Geolocation not supported');
        btn.innerHTML = '📍 Locating...';
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 13);
            L.circle([latitude, longitude], { radius: 500, color: 'var(--accent-blue)', fillOpacity: 0.2 }).addTo(map).bindPopup('You are here!').openPopup();
            btn.innerHTML = '📍 Relocate';
        }, () => { alert('Location access denied'); btn.innerHTML = '📍 Locate Me'; });
    };
};

const createForecastCard = (f) => {
    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
        <div class="card-header"><span class="day-name">${f.day}</span><span class="date-text">${f.forecast.text}</span></div>
        <div class="weather-icon-container"><span style="font-size: 3rem;">${getWeatherIcon(f.forecast.code)}</span></div>
        <div class="weather-status">${f.forecast.text}</div>
        <div class="temp-range">
            <div class="temp-item"><span class="temp-val">${f.temperature.high}°C</span></div>
            <div class="temp-item" style="opacity: 0.5;"><span class="temp-val">|</span></div>
            <div class="temp-item"><span class="temp-val">${f.temperature.low}°C</span></div>
        </div>
    `;
    return card;
};

const fetchEnvironmentalData = async () => {
    try {
        const psiRes = await fetch(PSI_URL);
        if (psiRes.ok) {
            const val = (await psiRes.json()).data.items[0].readings.psi_twenty_four_hourly.central;
            updateStatusItem('status-psi', `PSI: ${val}`, val > 100 ? 'status-unhealthy' : (val > 50 ? 'status-moderate' : 'status-good'));
        }
        const uvRes = await fetch(UV_URL);
        if (uvRes.ok) {
            const val = (await uvRes.json()).data.records[0].index[0].value;
            updateStatusItem('status-uv', `UV: ${val}`, val > 7 ? 'status-unhealthy' : (val > 2 ? 'status-moderate' : 'status-good'));
        }
    } catch (e) {}
};

const checkWeatherAlerts = async () => {
    const banner = document.getElementById('alert-banner');
    const alertText = document.getElementById('alert-text');
    let alerts = [];
    try {
        const [rainRes, lightRes] = await Promise.all([fetch(RAIN_URL), fetch(LIGHTNING_URL)]);
        if (rainRes.ok && (await rainRes.json()).data.items[0].readings.some(r => r.value > 0.5)) alerts.push("Heavy rain detected.");
        if (lightRes.ok && ((await lightRes.json()).data.items[0].readings || []).length > 0) alerts.push("Lightning spotted.");
        
        if (alerts.length > 0) {
            alertText.textContent = alerts.join(" ") + " Stay safe!";
            banner.classList.remove('hidden');
        } else banner.classList.add('hidden');
    } catch (e) {}
};

const fetchWeather = async () => {
    const container = document.getElementById('forecast-container');
    const updateTime = document.getElementById('last-updated');
    initMap(); fetchMapData(); setupLocateMe(); fetchEnvironmentalData(); checkWeatherAlerts();
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error();
        const latestRecord = (await response.json()).data.records[0];
        container.innerHTML = '';
        updateTime.textContent = `Last synchronized: ${formatTimestamp(latestRecord.updatedTimestamp)}`;
        latestRecord.forecasts.slice(0, 4).forEach((f, index) => {
            const card = createForecastCard(f);
            card.style.animationDelay = `${index * 0.1}s`;
            container.appendChild(card);
        });
    } catch (error) {
        container.innerHTML = '<div class="loader"><p>Connection trouble. Retrying...</p></div>';
    }
};

document.addEventListener('DOMContentLoaded', fetchWeather);
setInterval(fetchWeather, 15 * 60 * 1000);
