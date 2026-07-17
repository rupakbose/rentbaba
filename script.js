// -------------------------------------------------------------------------
// 1. DOCK-DRIVEN MAP INITIALIZATION (MUMBAI-CENTRIC)
// -------------------------------------------------------------------------
const MUMBAI_COORDS = [19.073506415477542, 72.83926927214105];

const map = L.map('map', {
    zoomControl: false, 
    attributionControl: false,
    preferCanvas: true, // Hardware-accelerated canvas
    tap: !L.Browser.mobile,
    bounceAtZoomLimits: false
}).setView(MUMBAI_COORDS, 20);

// Prepare Tile Layers
const lightBasemap = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd' });
const darkBasemap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd' });

const lightLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd', opacity: 0.9 });
const darkLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd', opacity: 0.85 });

// Establish Separate Labels Pane on top of canvas
const labelsPane = map.createPane('top-labels');
labelsPane.style.zIndex = 650;
labelsPane.style.pointerEvents = 'none';

lightBasemap.addTo(map);
lightLabels.addTo(map);

// -------------------------------------------------------------------------
// 2. UNBOUNDED INDEPENDENT SLIDER EQUATIONS
// -------------------------------------------------------------------------
let rawWeights = {
    utility: 40,
    green: 30,
    quietness: 30
};

function computeSuitabilityScore(props) {
    const sum = rawWeights.utility + rawWeights.green + rawWeights.quietness;
    
    const normUtility = sum > 0 ? (rawWeights.utility / sum) : 0.333;
    const normGreen = sum > 0 ? (rawWeights.green / sum) : 0.333;
    const normQuietness = sum > 0 ? (rawWeights.quietness / sum) : 0.333;

    const rawU = props.utility_score !== undefined ? props.utility_score : 5;
    const rawG = props.green_score !== undefined ? props.green_score : 5;
    const rawQ = props.quietness_score !== undefined ? props.quietness_score : 5;

    const dynamicScore = (rawU * normUtility) + (rawG * normGreen) + (rawQ * normQuietness);
    return Math.min(10.0, Math.max(1.0, parseFloat(dynamicScore.toFixed(1))));
}

// Aesthetic color ramp matching score properties
function getAestheticColor(score) {
    return score > 8.5 ? '#047857' : // Deep Emerald
           score > 6.5 ? '#10b981' : // Soft Green
           score > 4.5 ? '#f59e0b' : // Orange Warning
           score > 2.5 ? '#f97316' : // Deep Orange
                         '#dc2626';  // Alert Crimson
}

function computeStyle(feature) {
    const score = computeSuitabilityScore(feature.properties);
    return {
        fillColor: getAestheticColor(score),
        weight: 1,
        opacity: 0.5,
        color: '#ffffff',
        fillOpacity: 0.65
    };
}

// -------------------------------------------------------------------------
// 3. PERFORMANCE-FIRST SPATIAL VIEWPORT CULLING & MINIMAL POPUPS
// -------------------------------------------------------------------------
let cachedData = null;
let selectedBuilding = null;

const activeBuildingsLayer = L.geoJSON(null, {
    style: computeStyle,
    onEachFeature: function(feature, layer) {
        layer.on({
            click: function() {
                if (selectedBuilding && selectedBuilding !== layer) {
                    activeBuildingsLayer.resetStyle(selectedBuilding);
                }
                layer.setStyle({
                    weight: 3,
                    color: '#0f172a',
                    fillOpacity: 0.95
                });
                selectedBuilding = layer;
            }
        });

        layer.bindPopup(() => {
            const props = feature.properties;
            const currentScore = computeSuitabilityScore(props);
            
            // Minimal layout: no "Building Evaluation" header, direct clean metrics
            return `
                <div style="font-size:12px; line-height: 1.5; min-width: 190px; color:#1e293b; padding: 4px 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-weight:600;">Livability:</span>
                        <strong style="font-size:16px; font-weight:700; color:${getAestheticColor(currentScore)};">${currentScore} / 10</strong>
                    </div>
                    <div style="color: #64748b; font-size: 11px; display: flex; flex-direction: column; gap: 3px;">
                        <span>🚇 Transit: <b>${props.dist_utility_m || 'N/A'}m</b></span>
                        <span>🌳 Parks: <b>${props.dist_green_m || 'N/A'}m</b></span>
                        <span>🔊 Quietness: <b>${props.quietness_score || 0}/10</b></span>
                    </div>
                </div>
            `;
        }, { closeButton: false, offset: L.point(0, -3) });
    }
}).addTo(map);

function getFeatureCentroid(feature) {
    let coords = feature.geometry.coordinates;
    if (feature.geometry.type === 'MultiPolygon') {
        coords = coords[0][0][0];
    } else if (feature.geometry.type === 'Polygon') {
        coords = coords[0][0];
    }
    return L.latLng(coords[1], coords[0]);
}

function runViewportSpatialCull() {
    if (!cachedData) return;
    const currentBounds = map.getBounds();

    const culledFeatures = cachedData.features.filter(feat => {
        try {
            const point = getFeatureCentroid(feat);
            return currentBounds.contains(point);
        } catch (e) {
            return false;
        }
    });

    activeBuildingsLayer.clearLayers();
    activeBuildingsLayer.addData(culledFeatures);
}

map.on('moveend zoomend', runViewportSpatialCull);

// -------------------------------------------------------------------------
// 4. THEME CONTROLLER (SLIDER SWITCH)
// -------------------------------------------------------------------------
const themeToggleCheckbox = document.getElementById('theme-toggle-checkbox');

themeToggleCheckbox.addEventListener('change', function() {
    if (this.checked) {
        map.removeLayer(lightBasemap);
        map.removeLayer(lightLabels);
        darkBasemap.addTo(map);
        darkLabels.addTo(map);
    } else {
        map.removeLayer(darkBasemap);
        map.removeLayer(darkLabels);
        lightBasemap.addTo(map);
        lightLabels.addTo(map);
    }
});

// -------------------------------------------------------------------------
// 5. WEIGHT TUNING & VIEWPORT-ONLY REALTIME UPDATE
// -------------------------------------------------------------------------
const sUtility = document.getElementById('slider-utility');
const sGreen = document.getElementById('slider-green');
const sQuietness = document.getElementById('slider-quietness');

function updateWeights() {
    rawWeights.utility = parseFloat(sUtility.value);
    rawWeights.green = parseFloat(sGreen.value);
    rawWeights.quietness = parseFloat(sQuietness.value);

    // Recolor and refresh active viewport components
    activeBuildingsLayer.setStyle(computeStyle);
}

sUtility.addEventListener('input', updateWeights);
sGreen.addEventListener('input', updateWeights);
sQuietness.addEventListener('input', updateWeights);

// Clean reset operation
document.getElementById('reset-weights-btn').addEventListener('click', () => {
    sUtility.value = 40;
    sGreen.value = 30;
    sQuietness.value = 30;
    updateWeights();
});

// -------------------------------------------------------------------------
// 6. TOGGLE CONTROLS TRAY INTERFACE
// -------------------------------------------------------------------------
const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
const settingsTray = document.getElementById('settings-tray');

toggleSettingsBtn.addEventListener('click', () => {
    const isClosed = settingsTray.classList.contains('hidden');
    if (isClosed) {
        settingsTray.classList.remove('hidden');
        toggleSettingsBtn.classList.add('active');
    } else {
        settingsTray.classList.add('hidden');
        toggleSettingsBtn.classList.remove('active');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !settingsTray.classList.contains('hidden')) {
        settingsTray.classList.add('hidden');
        toggleSettingsBtn.classList.remove('active');
    }
});

// -------------------------------------------------------------------------
// 7. ROBUST GEOLOCATOR WITH FALLBACKS
// -------------------------------------------------------------------------
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const clearSearchBtn = document.getElementById('clear-search');
let focusGlowMarker = null;
let debounceTimer = null;

function parseCoordinatesInput(text) {
    const coordPattern = /^[-+]?([1-9]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/;
    if (coordPattern.test(text)) {
        const parts = text.split(',').map(num => parseFloat(num.trim()));
        return { lat: parts[0], lon: parts[1] };
    }
    return null;
}

searchInput.addEventListener('input', function() {
    const rawQuery = this.value.trim();
    if (rawQuery.length > 0) {
        clearSearchBtn.style.display = 'block';
    } else {
        clearSearchBtn.style.display = 'none';
        searchResults.style.display = 'none';
        return;
    }

    const coordinateMatch = parseCoordinatesInput(rawQuery);
    if (coordinateMatch) {
        drawDirectCoordinatesRow(coordinateMatch);
        return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const strictLocalGeocodeUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(rawQuery)}&lat=19.0760&lon=72.8777&bbox=72.75,18.88,73.05,19.33&limit=5`;
        
        fetch(strictLocalGeocodeUrl)
            .then(res => res.json())
            .then(data => {
                if (!data.features || data.features.length === 0) {
                    const broadUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(rawQuery)}&lat=19.0760&lon=72.8777&limit=5`;
                    return fetch(broadUrl).then(r => r.json());
                }
                return data;
            })
            .then(data => {
                drawAutocompleteBox(data.features);
            })
            .catch(err => console.error("Geocoding query timed out or offline", err));
    }, 200);
});

function drawDirectCoordinatesRow(coords) {
    searchResults.innerHTML = '';
    const itemRow = document.createElement('div');
    itemRow.className = 'search-result-item';
    itemRow.innerHTML = `📍 <strong>Navigate directly:</strong> ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`;
    itemRow.addEventListener('click', () => {
        executeMapNavigation([coords.lat, coords.lon], `Point: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`);
    });
    searchResults.appendChild(itemRow);
    searchResults.style.display = 'block';
}

function drawAutocompleteBox(features) {
    searchResults.innerHTML = '';
    if (!features || features.length === 0) {
        searchResults.style.display = 'none';
        return;
    }

    features.forEach(f => {
        const p = f.properties;
        const name = p.name || '';
        const street = p.street ? `, ${p.street}` : '';
        const district = p.district ? `, ${p.district}` : '';
        const matchedLabel = `${name}${street}${district}`;

        const itemRow = document.createElement('div');
        itemRow.className = 'search-result-item';
        itemRow.innerText = matchedLabel;

        itemRow.addEventListener('click', () => {
            const coordinates = f.geometry.coordinates;
            executeMapNavigation([coordinates[1], coordinates[0]], matchedLabel);
        });

        searchResults.appendChild(itemRow);
    });
    searchResults.style.display = 'block';
}

function executeMapNavigation(targetLatLng, labelText) {
    searchResults.style.display = 'none';
    searchInput.value = labelText;

    map.flyTo(targetLatLng, 17, { animate: true, duration: 1.2 });

    if (focusGlowMarker) {
        map.removeLayer(focusGlowMarker);
    }

    const radialGlow = L.divIcon({
        className: 'pulse-radial',
        html: '<div class="geocoded-glow"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });
    focusGlowMarker = L.marker(targetLatLng, { icon: radialGlow }).addTo(map);
}

clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchResults.style.display = 'none';
    if (focusGlowMarker) {
        map.removeLayer(focusGlowMarker);
        focusGlowMarker = null;
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-bar-dock')) {
        searchResults.style.display = 'none';
    }
});

// -------------------------------------------------------------------------
// 8. UNIFIED GEOSPATIAL PIPELINE INGESTION
// -------------------------------------------------------------------------
fetch('buildings.geojson')
    .then(r => { if (!r.ok) throw r; return r.json(); })
    .then(buildings => {
        cachedData = buildings;
        runViewportSpatialCull();
        triggerGuidedOnboarding();
    })
    .catch(err => {
        console.warn("Could not retrieve buildings.geojson.", err);
        triggerGuidedOnboarding();
    });

// -------------------------------------------------------------------------
// 9. MINIMAL ONBOARDING TOUR
// -------------------------------------------------------------------------
function triggerGuidedOnboarding() {
    const hasOnboarded = localStorage.getItem('mumbai_minimal_unbound_onboarded');
    if (hasOnboarded) return;

    setTimeout(() => {
        const tour = introJs();
        tour.setOptions({
            nextLabel: 'Next →',
            prevLabel: '← Back',
            skipLabel: 'Skip',
            doneLabel: 'Explore Mumbai',
            overlayOpacity: 0.5,
            scrollToElement: true,
            exitOnOverlayClick: false,
            exitOnEsc: true
        });

        const finish = () => localStorage.setItem('mumbai_minimal_unbound_onboarded', 'true');
        tour.oncomplete(finish);
        tour.onexit(finish);
        tour.start();
    }, 1200);
}