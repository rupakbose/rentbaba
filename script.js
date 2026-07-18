import { parquetReadObjects } from "https://cdn.jsdelivr.net/npm/hyparquet@1.26.2/+esm";
import { compressors } from "https://cdn.jsdelivr.net/npm/hyparquet-compressors@0.1.2/+esm";
import { decompress } from "https://cdn.jsdelivr.net/npm/fzstd@0.1.1/+esm";

// 2. Register the Zstd decoder codec ID (1) into hyparquet's compressor map
compressors[1] = (input, outputLength) => decompress(input);

// -------------------------------------------------------------------------
// 1. DOCK-DRIVEN MAP INITIALIZATION (DYNAMIC MULTI-CITY REGISTRY)
// -------------------------------------------------------------------------
let geojsonLayer = null;
let selectedLayer = null;
let currentCity = 'mumbai'; // Default baseline
let rawWeights = { utility: 40, green: 30, quietness: 30 };

// High-precision geometric coordinate anchors for core operational areas
const CITY_ANCHORS = {
    mumbai: { center: [19.073506415477542, 72.83926927214105], zoom: 20 },
    bengaluru: { center: [12.971598, 77.594566], zoom: 20 },
    delhi: { center: [28.613939, 77.209021], zoom: 20 }
};

const map = L.map('map', {
    zoomControl: false, 
    attributionControl: false,
    preferCanvas: true, // Crucial for rendering thousands of paths instantly
    tap: !L.Browser.mobile
}).setView(CITY_ANCHORS[currentCity].center, CITY_ANCHORS[currentCity].zoom);

// Prepare Basemap Layers
const lightBasemap = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd' });
const darkBasemap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd' });

const lightLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd', opacity: 0.9 });
const darkLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd', opacity: 0.85 });

lightBasemap.addTo(map);
lightLabels.addTo(map);

// -------------------------------------------------------------------------
// 2. UNBOUNDED INDEPENDENT SLIDER EQUATIONS
// -------------------------------------------------------------------------
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


function getAestheticColor(score) {
    return score >= 8.0 ? '#2ECC71' : // Green - Excellent
           score >= 6.5 ? '#F1C40F' : // Yellow - Good
           score >= 4.5 ? '#F39C12' : // Orange - Average
           score >= 2.5 ? '#E74C3C' : // Red - Poor
                           '#7B241C';  // Dark Maroon - Very Poor
}

function computeStyle(properties, isSelected = false) {
    const score = computeSuitabilityScore(properties);
    const color = getAestheticColor(score);
    return {
        fillColor: color,
        fillOpacity: isSelected ? 0.95 : 0.70,
        fill: true,
        stroke: false,
        color: isSelected ? '#ffffff' : '#1e293b', // White outline if selected, otherwise deep charcoal
        weight: isSelected ? 2.5 : 0.75,           // Crisp fine borders
        opacity: isSelected ? 1.0 : 0.8
    };
}

// -------------------------------------------------------------------------
// 3. HIGH-SPEED GEOPARQUET STREAMING & STATE REGISTRATION PIPELINE
// -------------------------------------------------------------------------
async function switchCityDataset(cityName) {
    if (currentCity === cityName && geojsonLayer) return; // Already displaying this target asset
    
    currentCity = cityName;
    
    if (selectedLayer && geojsonLayer) {
        geojsonLayer.resetStyle(selectedLayer);
    }

    // Purge map feature layer elements safely to protect RAM allocation thresholds
    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
        geojsonLayer = null;
    }
    if (selectedLayer) {
        selectedLayer = null;
    }
    if (focusGlowMarker) {
        map.removeLayer(focusGlowMarker);
        focusGlowMarker = null;
    }

    const target = CITY_ANCHORS[cityName];
    map.flyTo(target.center, target.zoom, { animate: true, duration: 1.2 });

    try {
        await loadGeoParquetData(`./${cityName}.parquet`);
    } catch (err) {
        console.error(`Error unpacking GeoParquet binary arrays for ${cityName}:`, err);
        triggerGuidedOnboarding();
    }
}

async function loadGeoParquetData(fileUrl) {
    // 1. Initialize Leaflet Map Feature Layer
    geojsonLayer = L.geoJSON(null, {
        onEachFeature: function (feature, layer) {
            layer.setStyle(computeStyle(feature.properties));

            layer.on('click', function (e) {
                if (selectedLayer) {
                    geojsonLayer.resetStyle(selectedLayer);
                }

                selectedLayer = layer;
                layer.setStyle(computeStyle(feature.properties, true));
                layer.bringToFront();

                const props = feature.properties;
                const currentScore = computeSuitabilityScore(props);

                // Compute components for dynamic text rendering
                const uScore = props.utility_score !== undefined ? props.utility_score : 5;
                const gScore = props.green_score !== undefined ? props.green_score : 5;
                const qScore = props.quietness_score !== undefined ? props.quietness_score : 5;

                // Dynamic qualitative description string generator
                let qualityLabel = "Poor";
                if (currentScore >= 8.5) qualityLabel = "Excellent";
                else if (currentScore >= 6.5) qualityLabel = "Good";
                else if (currentScore >= 4.5) qualityLabel = "Average";
                else if (currentScore >= 2.5) qualityLabel = "Below Avg";

                // Pure functional dot string mapper (Normalizes a 0-10 scale down to a 5-dot matrix)
                const getDots = (score) => {
                    const filled = Math.round(score / 2);
                    return "●".repeat(filled) + "○".repeat(5 - filled);
                };

                // Precise walking runtime transformations (Metric base: 80 meters per minute baseline)
                const getWalkTime = (meters) => {
                    if (meters === undefined || meters === null) return "N/A";
                    const mins = Math.round(meters / 80);
                    return `${meters} m (~${mins} min walk)`;
                };

                const popupContent = `
                    <div style="font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.4; min-width: 220px; color: #1e293b; padding: 4px 2px;">
                        <!-- Header: Score Dashboard Block -->
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                            <span style="font-weight: 600; font-size: 13px; color: #0f172a;">Livability</span>
                            <strong style="font-size: 15px; font-weight: 700; color: ${getAestheticColor(currentScore)};">${currentScore.toFixed(1)}/10</strong>
                        </div>
                        
                        <!-- Metrics Progress Representation -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div style="letter-spacing: -1px; font-size: 14px; color: ${getAestheticColor(currentScore)}; font-weight: bold;">
                                ${"█".repeat(Math.round(currentScore))}${"░".repeat(10 - Math.round(currentScore))}
                            </div>
                            <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">${qualityLabel}</span>
                        </div>
                        
                        <!-- Segment Summary Grid (Dot Matrix Layout) -->
                        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #475569;">🚶 Transit</span>
                                <span style="font-family: monospace; font-size: 13px; color: #0284c7; letter-spacing: 1px;">${getDots(uScore)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #475569;">🌳 Parks</span>
                                <span style="font-family: monospace; font-size: 13px; color: #16a34a; letter-spacing: 1px;">${getDots(gScore)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #475569;">🔇 Quiet</span>
                                <span style="font-family: monospace; font-size: 13px; color: #ea580c; letter-spacing: 1px;">${getDots(qScore)}</span>
                            </div>
                        </div>

                        <!-- Collapsible Raw Details Extension Panel -->
                        <details class="popup-details-tray" style="border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 4px;">
                            <summary style="cursor: pointer; font-size: 11px; font-weight: 600; color: #2563eb; outline: none; list-style: none; display: flex; align-items: center; gap: 2px;">
                                <span class="details-toggle-arrow">Show details ▾</span>
                            </summary>
                            <div style="padding-top: 8px; display: flex; flex-direction: column; gap: 8px; color: #334155;">
                                <div>
                                    <div style="font-weight: 600; font-size: 11px; color: #475569;">🚶 Walk to nearest transit</div>
                                    <div style="font-size: 11px; color: #64748b; padding-left: 14px; margin-top: 1px;">${getWalkTime(props.dist_utility_m)}</div>
                                </div>
                                <div>
                                    <div style="font-weight: 600; font-size: 11px; color: #475569;">🌳 Walk to nearest park</div>
                                    <div style="font-size: 11px; color: #64748b; padding-left: 14px; margin-top: 1px;">${getWalkTime(props.dist_green_m)}</div>
                                </div>
                                <div>
                                    <div style="font-weight: 600; font-size: 11px; color: #475569;">🔇 Quietness</div>
                                    <div style="font-size: 11px; color: #64748b; padding-left: 14px; margin-top: 1px;">${qScore.toFixed(2)} / 10</div>
                                </div>
                            </div>
                        </details>
                    </div>
                `;

                L.popup({ closeButton: false, offset: L.point(0, -3) })
                    .setLatLng(e.latlng)
                    .setContent(popupContent)
                    .openOn(map);
            });
        }
    }).addTo(map);

    // 2. Fetch the highly compressed binary file into an ArrayBuffer
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`HTTP Error fetching parquet asset: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    
    // Create the AsyncBuffer wrapper layout required by hyparquet's streaming architecture
    const asyncBuffer = {
        byteLength: arrayBuffer.byteLength,
        slice: async (start, end) => arrayBuffer.slice(start, end)
    };
    
    // 3. Read the array records directly using modern hyparquet
    const records = await parquetReadObjects({
        file: asyncBuffer, // <-- Pass the wrapped buffer object here
        compressors: compressors
    });

    // 4. Transform native records directly into Leaflet-ready GeoJSON features
    const featureCollection = { type: "FeatureCollection", features: [] };

    records.forEach((row, index) => {
        let targetGeometry = row.geometry;
        if (typeof targetGeometry === 'string') {
            try { targetGeometry = JSON.parse(targetGeometry); } catch(e) { return; }
        }

        if (!targetGeometry) return; // Guard against corrupt features

        const recordId = row.id !== undefined ? row.id : index;

        featureCollection.features.push({
            type: "Feature",
            id: recordId,
            geometry: targetGeometry,
            properties: {
                id: recordId,
                dist_utility_m: row.dist_utility_m !== undefined ? row.dist_utility_m : 0,
                dist_green_m: row.dist_green_m !== undefined ? row.dist_green_m : 0,
                utility_score: row.utility_score !== undefined ? row.utility_score : 0,
                green_score: row.green_score !== undefined ? row.green_score : 0,
                quietness_score: row.quietness_score !== undefined ? row.quietness_score : 0
            }
        });
    });

    // 5. Pipe features down into the GPU-accelerated Leaflet Canvas
    geojsonLayer.addData(featureCollection);
    
    triggerGuidedOnboarding();
}

map.on('popupclose', () => {
    if (selectedLayer) {
        geojsonLayer.resetStyle(selectedLayer);
        selectedLayer = null;
    }
});

// -------------------------------------------------------------------------
// 4. THEME CONTROLLER
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
// 5. WEIGHT TUNING ENGINE
// -------------------------------------------------------------------------
const sUtility = document.getElementById('slider-utility');
const sGreen = document.getElementById('slider-green');
const sQuietness = document.getElementById('slider-quietness');

function updateWeights() {
    rawWeights.utility = parseFloat(sUtility.value);
    rawWeights.green = parseFloat(sGreen.value);
    rawWeights.quietness = parseFloat(sQuietness.value);

    if (geojsonLayer) {
        geojsonLayer.eachLayer(function (layer) {
            const isSelected = (layer === selectedLayer);
            layer.setStyle(computeStyle(layer.feature.properties, isSelected));
        });

        // Live update active popup content if visible
        const activePopup = map._popup;
        if (activePopup && activePopup.isOpen() && selectedLayer) {
            const props = selectedLayer.feature.properties;
            const updatedScore = computeSuitabilityScore(props);
            
            const updatedContent = `
                <div style="font-size:12px; line-height: 1.5; min-width: 190px; color:#1e293b; padding: 4px 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-weight:600;">Livability:</span>
                        <strong style="font-size:16px; font-weight:700; color:${getAestheticColor(updatedScore)};">${updatedScore} / 10</strong>
                    </div>
                    <div style="color: #64748b; font-size: 11px; display: flex; flex-direction: column; gap: 3px;">
                        <span>🚇 Transit Hub: <b>${props.dist_utility_m !== undefined ? props.dist_utility_m + 'm' : 'N/A'}</b></span>
                        <span>🌳 Green Space: <b>${props.dist_green_m !== undefined ? props.dist_green_m + 'm' : 'N/A'}</b></span>
                        <span>🔊 Quietness: <b>${props.quietness_score || 0}/10</b></span>
                    </div>
                </div>
            `;
            activePopup.setContent(updatedContent);
        }
    }
}

sUtility.addEventListener('input', updateWeights);
sGreen.addEventListener('input', updateWeights);
sQuietness.addEventListener('input', updateWeights);

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
// 7. INTELLIGENT SEARCH ENGINE CONTROLLER & AUTO-CITY COMPILATION
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
    const cleanQueryLower = rawQuery.toLowerCase();
    
    if (rawQuery.length > 0) {
        clearSearchBtn.style.display = 'block';
    } else {
        clearSearchBtn.style.display = 'none';
        searchResults.style.display = 'none';
        return;
    }

    // ⚡ INTERCEPT: Core Multi-City Search Routing Engine
    // If the input matches a key city exactly, inject immediate transition selection mapping
    if (CITY_ANCHORS[cleanQueryLower]) {
        drawCitySwitchRow(cleanQueryLower);
        return;
    }

    const coordinateMatch = parseCoordinatesInput(rawQuery);
    if (coordinateMatch) {
        drawDirectCoordinatesRow(coordinateMatch);
        return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        // Build dynamic focal location context dependent on the currently rendered market asset
        const activeAnchor = CITY_ANCHORS[currentCity].center;
        const strictLocalGeocodeUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(rawQuery)}&lat=${activeAnchor[0]}&lon=${activeAnchor[1]}&limit=5`;
        
        fetch(strictLocalGeocodeUrl)
            .then(res => res.json())
            .then(data => {
                // Double check if any text result names inside the payload match an available city asset
                const modifiedFeatures = data.features || [];
                drawAutocompleteBox(modifiedFeatures);
            })
            .catch(err => console.error("Geocoding query timed out or offline", err));
    }, 200);
});

function drawCitySwitchRow(cityName) {
    searchResults.innerHTML = '';
    const itemRow = document.createElement('div');
    itemRow.className = 'search-result-item';
    
    // Capitalize first character for beautiful representation layout
    const formattedName = cityName.charAt(0).toUpperCase() + cityName.slice(1);
    itemRow.innerHTML = `🏢 <strong>Switch Environment:</strong> Load dynamic layout for ${formattedName}`;
    
    itemRow.addEventListener('click', () => {
        searchResults.style.display = 'none';
        searchInput.value = formattedName;
        switchCityDataset(cityName);
    });
    
    searchResults.appendChild(itemRow);
    searchResults.style.display = 'block';
}

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
    
    // If the user hasn't explicitly hit an exact key, but searched for city keywords
    const rawVal = searchInput.value.trim().toLowerCase();
    
    if (CITY_ANCHORS[rawVal]) {
        drawCitySwitchRow(rawVal);
        return;
    }

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
        const matchedLabelLower = matchedLabel.toLowerCase();

        // Check if the result string targets a secondary city environment switch threshold
        let operationalCityMatch = null;
        Object.keys(CITY_ANCHORS).forEach(cKey => {
            if (matchedLabelLower.includes(cKey) && cKey !== currentCity && (rawVal.includes(cKey) || p.type === 'city')) {
                operationalCityMatch = cKey;
            }
        });

        const itemRow = document.createElement('div');
        itemRow.className = 'search-result-item';
        
        if (operationalCityMatch) {
            itemRow.innerHTML = `🏢 <b>Switch to ${operationalCityMatch.charAt(0).toUpperCase() + operationalCityMatch.slice(1)}:</b> ${matchedLabel}`;
            itemRow.addEventListener('click', () => {
                searchResults.style.display = 'none';
                searchInput.value = operationalCityMatch.charAt(0).toUpperCase() + operationalCityMatch.slice(1);
                switchCityDataset(operationalCityMatch);
            });
        } else {
            itemRow.innerText = matchedLabel;
            itemRow.addEventListener('click', () => {
                const coordinates = f.geometry.coordinates;
                executeMapNavigation([coordinates[1], coordinates[0]], matchedLabel);
            });
        }

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
    if (!e.target.closest('.control-wrapper')) {
        searchResults.style.display = 'none';
    }
});

// -------------------------------------------------------------------------
// 8. MINIMAL ONBOARDING TOUR
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
            doneLabel: 'Explore System',
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
// -------------------------------------------------------------------------
// RE-SET HIGHLIGHT STATE ON BLANK MAP CLICKS & POPUP CLOSURES
// -------------------------------------------------------------------------
function clearActiveFeatureSelection() {
    if (selectedLayer && geojsonLayer) {
        geojsonLayer.resetStyle(selectedLayer);
        selectedLayer = null;
    }
}

// 1. Clear selection when the user clicks on the empty map backdrop
map.on('click', function (e) {
    // Leaflet's map click event automatically ignores vector layer clicks,
    // making this the safest place to clear highlights.
    clearActiveFeatureSelection();
});

// 2. Clear selection when a popup is closed (via 'X' button, Esc key, or map.closePopup())
map.on('popupclose', function () {
    clearActiveFeatureSelection();
});
// -------------------------------------------------------------------------
// 9. SYSTEM COLD-START LAUNCH SEQUENCE
// -------------------------------------------------------------------------
// Initiates the current active default environment dataset download on application entry
switchCityDataset(currentCity);