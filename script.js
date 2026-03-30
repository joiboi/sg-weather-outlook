const API_URL = 'https://api-open.data.gov.sg/v2/real-time/api/four-day-outlook';
const PSI_URL = 'https://api-open.data.gov.sg/v2/real-time/api/psi';
const UV_URL = 'https://api-open.data.gov.sg/v2/real-time/api/uv';
const NOW_URL = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast';
const TEMP_URL = 'https://api-open.data.gov.sg/v2/real-time/api/air-temperature';
const RAIN_URL = 'https://api-open.data.gov.sg/v2/real-time/api/rainfall';
const LIGHTNING_URL = 'https://api-open.data.gov.sg/v2/real-time/api/weather?api=lightning';
const TWENTY_FOUR_URL = 'https://api-open.data.gov.sg/v2/real-time/api/twenty-four-hr-forecast';

// Global Data Persistence
let horizonData = null;
let currentAreaMetadata = [];

// Global Map instances
let map;
let mapMarkers = [];

// Improved Icon Mapping
const getWeatherIcon = (code) => {
    const iconMap = {
        'PC': '⛅', 'PS': '🌦️', 'TS': '⛈️', 'CL': '☀️', 'CD': '☁️', 'OC': '☁️',
        'RA': '🌧️', 'LR': '🌦️', 'HR': '🌧️', 'SW': '🏖️', 'FA': '☀️'
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

const updateStatusItem = (id, valId, text, className) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valId);
    if (!el || !valEl) return;
    valEl.textContent = text;
    if (className) el.className = 'status-item ' + className;
};

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
                    <div id="popup-${area.name.replace(/\s+/g, '-')}" class="map-popup-nova">
                        <strong class="popup-title">${area.name}</strong>
                        <div class="popup-status">✨ ${forecast.forecast}</div>
                        <div class="popup-loading">Loading telemetry...</div>
                    </div>
                `)
                .addTo(map);

            marker.on('click', async () => {
                const popupId = `popup-${area.name.replace(/\s+/g, '-')}`;
                const popupEl = document.getElementById(popupId);
                if (!popupEl || popupEl.querySelector('.popup-details')) return;

                try {
                    const [psiRes, uvRes, tempRes] = await Promise.all([
                        fetch(PSI_URL), fetch(UV_URL), fetch(TEMP_URL)
                    ]);

                    const psiData = await psiRes.json();
                    const uvData = await uvRes.json();
                    const tempJson = await tempRes.json();

                    const regionalPsi = psiData.data.items[0].readings.psi_twenty_four_hourly;
                    const currentUv = uvData.data.records[0].index[0].value;
                    const stations = tempJson.data.stations;
                    const temps = tempJson.data.readings[0].data;

                    const getDistance = (lat1, lon1, lat2, lon2) => Math.sqrt(Math.pow(lat2-lat1, 2) + Math.pow(lon2-lon1, 2));

                    let closestStation = stations[0];
                    let minDistance = Infinity;
                    stations.forEach(s => {
                        const dist = getDistance(area.label_location.latitude, area.label_location.longitude, s.location.latitude, s.location.longitude);
                        if (dist < minDistance) { minDistance = dist; closestStation = s; }
                    });

                    const areaTemp = temps.find(t => t.stationId === closestStation.id);
                    const region = getRegion(area.name);
                    const psi = regionalPsi[region] || '--';

                    const detailsHtml = `
                        <div class="popup-details">
                            <span>🌡️ ${closestStation.name}: ${areaTemp ? areaTemp.value : '--'}°C</span>
                            <span>😷 ${region.toUpperCase()} PSI: ${psi}</span>
                            <span>☀️ UV Index: ${currentUv}</span>
                        </div>
                    `;
                    const loadingEl = popupEl.querySelector('.popup-loading');
                    if (loadingEl) loadingEl.remove();
                    popupEl.innerHTML += detailsHtml;
                } catch (err) { console.warn('Detail fetch error:', err); }
            });
            mapMarkers.push(marker);
        });
        currentAreaMetadata = nowData.area_metadata;
        setupHorizonSlider();
    } catch (e) { console.warn('Map data error:', e); }
};

const setupHorizonSlider = () => {
    const slider = document.getElementById('horizon-slider');
    const label = document.getElementById('current-period-label');
    if (!slider || !horizonData) return;

    slider.oninput = () => {
        const hoursAhead = parseInt(slider.value);
        const targetTime = new Date();
        targetTime.setHours(targetTime.getHours() + hoursAhead);
        
        // Find which period this hour belongs to
        const period = horizonData.periods.find(p => {
            const start = new Date(p.time.start);
            const end = new Date(p.time.end);
            return targetTime >= start && targetTime < end;
        }) || horizonData.periods[0]; // Fallback to first if out of bounds

        const general = horizonData.general;
        const displayHour = targetTime.getHours();
        const displayDay = targetTime.toLocaleDateString('en-SG', { weekday: 'short' });
        label.textContent = `Horizon: ${displayDay} ${displayHour}:00 (${hoursAhead}H Ahead)`;

        // Update Telemetry
        document.getElementById('tele-wind').textContent = `${general.wind.speed.low}-${general.wind.speed.high} km/h ${general.wind.direction}`;
        document.getElementById('tele-humid').textContent = `${general.relative_humidity.low}-${general.relative_humidity.high}%`;
        document.getElementById('tele-temp').textContent = `${general.temperature.low}° / ${general.temperature.high}°`;

        // Update Map Markers with regional forecast
        mapMarkers.forEach((marker, i) => {
            const area = currentAreaMetadata[i];
            if (!area) return;
            const region = getRegion(area.name);
            const regionalForecast = period.regions[region];
            if (regionalForecast) {
                marker.setIcon(L.divIcon({
                    className: 'area-weather-label',
                    html: `<div>${getWeatherIcon(regionalForecast)}</div>`,
                    iconSize: [30, 30]
                }));
                marker.getPopup().setContent(`
                    <div class="map-popup-nova">
                        <strong class="popup-title">${area.name}</strong>
                        <div class="popup-status">Horizon Status: ${regionalForecast}</div>
                        <div class="mono" style="font-size: 0.7rem; margin-top: 10px;">Relative Time: ${displayHour}:00</div>
                    </div>
                `);
            }
        });
    };
    slider.oninput(); // Initial run
};

const fetchHorizonData = async () => {
    try {
        const res = await fetch(TWENTY_FOUR_URL);
        if (res.ok) {
            const json = await res.json();
            horizonData = json.data.items[0];
            setupHorizonSlider();
        }
    } catch (e) {}
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
        <div class="card-header">
            <span class="day-name">${f.day}</span>
            <span class="date-text">${f.forecast.text}</span>
        </div>
        <div class="weather-icon-container">
            <span>${getWeatherIcon(f.forecast.code)}</span>
        </div>
        <div class="weather-status">${f.forecast.text}</div>
        <div class="temp-range">
            <div class="temp-item">
                <span class="temp-val">${f.temperature.high}°</span>
                <span class="temp-label">Max_Thermal</span>
            </div>
            <div class="temp-item">
                <span class="temp-val">${f.temperature.low}°</span>
                <span class="temp-label">Min_Thermal</span>
            </div>
        </div>
    `;
    return card;
};

const fetchEnvironmentalData = async () => {
    try {
        const psiRes = await fetch(PSI_URL);
        if (psiRes.ok) {
            const val = (await psiRes.json()).data.items[0].readings.psi_twenty_four_hourly.central;
            updateStatusItem('status-psi', 'psi-val', `PSI: ${val}`, val > 100 ? 'status-unhealthy' : (val > 50 ? 'status-moderate' : 'status-good'));
        }
        const uvRes = await fetch(UV_URL);
        if (uvRes.ok) {
            const val = (await uvRes.json()).data.records[0].index[0].value;
            updateStatusItem('status-uv', 'uv-val', `UV: ${val}`, val > 7 ? 'status-unhealthy' : (val > 2 ? 'status-moderate' : 'status-good'));
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
        if (alerts.length > 0) { alertText.textContent = "CRITICAL_STATUS: " + alerts.join(" ") + " SYSTEM_ALERT_ACTIVE."; banner.classList.remove('hidden'); } else banner.classList.add('hidden');
    } catch (e) {}
};

const fetchWeather = async () => {
    const container = document.getElementById('forecast-container');
    const updateTime = document.getElementById('last-updated');
    initMap(); fetchMapData(); setupLocateMe(); fetchEnvironmentalData(); checkWeatherAlerts(); fetchHorizonData();
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error();
        const latestRecord = (await response.json()).data.records[0];
        container.innerHTML = '';
        updateTime.textContent = `System Active / Global Sync: ${formatTimestamp(latestRecord.updatedTimestamp)}`;
        latestRecord.forecasts.slice(0, 4).forEach((f, index) => {
            const card = createForecastCard(f);
            card.style.animationDelay = `${index * 0.1}s`;
            container.appendChild(card);
        });
    } catch (error) { container.innerHTML = '<div class="loader"><p>Connection trouble. Retrying...</p></div>'; }
};

document.addEventListener('DOMContentLoaded', fetchWeather);
setInterval(fetchWeather, 15 * 60 * 1000);
