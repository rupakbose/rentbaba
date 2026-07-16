// -------------------------------------------------------------------------
// 1. HARDWARE ACCELERATION & MAP INITIALIZATION
// -------------------------------------------------------------------------
const map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    preferCanvas: true,            // Hardware-accelerated canvas
    tap: !L.Browser.mobile,
    bounceAtZoomLimits: false
}).setView([19.0735, 72.8393], 17); // Start close to Vile Parle / Andheri, Mumbai

// Base map style (CartoDB Positron No Labels)
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    updateWhenIdle: true,
    updateWhenZooming: false
}).addTo(map);

// Custom pane to force street labels on top
const labelPane = map.createPane('labels-top');
labelPane.style.zIndex = 650;         
labelPane.style.pointerEvents = 'none'; 

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    pane: 'labels-top',
    opacity: 1.0
}).addTo(map);

// Shift map default zoom controls out of the search bar's way
map.zoomControl.setPosition('bottomleft');

// -------------------------------------------------------------------------
// 2. ULTRA-ACCURATE LOCAL BIASED GEOLOCATION SEARCH (PHOTON)
// -------------------------------------------------------------------------
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const clearSearchBtn = document.getElementById('clear-search');
let searchHighlightMarker = null; // Holds the active search highlight marker
let debounceTimeout = null;

// Listen for typing inside the search bar
searchInput.addEventListener('input', function() {
    const query = this.value.trim();
    
    if (query.length > 0) {
        clearSearchBtn.style.display = 'block';
    } else {
        clearSearchBtn.style.display = 'none';
        searchResults.style.display = 'none';
        return;
    }

    // Debounce the API call to preserve resources
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        // We append lat/lon parameters to bias the search results locally to Mumbai
        const localBiasUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=19.0735&lon=72.8393&limit=6`;

        fetch(localBiasUrl)
            .then(res => res.json())
            .then(data => {
                displaySearchResults(data.features);
            })
            .catch(err => console.error("Search API failed", err));
    }, 250); // 250ms debounce
});

// Render the dropdown list with elegant formatting
function displaySearchResults(features) {
    searchResults.innerHTML = '';
    if (!features || features.length === 0) {
        searchResults.style.display = 'none';
        return;
    }

    features.forEach(feature => {
        const props = feature.properties;
        const name = props.name || '';
        const street = props.street ? `, ${props.street}` : '';
        const city = props.city ? `, ${props.city}` : '';
        const labelText = `${name}${street}${city}`;

        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerText = labelText;
        
        // When user clicks on a search suggestion
        div.addEventListener('click', () => {
            const coords = feature.geometry.coordinates;
            const latLng = [coords[1], coords[0]]; // Photon returns [lon, lat]

            // Clear suggestions
            searchResults.style.display = 'none';
            searchInput.value = labelText;

            // Smoothly fly to selected target location at high zoom level
            map.flyTo(latLng, 17, { animate: true, duration: 1.5 });

            // -----------------------------------------------------------
            // VISUAL HIGHLIGHT: Remove old pin and drop a beautiful ripple indicator
            // -----------------------------------------------------------
            if (searchHighlightMarker) {
                map.removeLayer(searchHighlightMarker);
            }

            const pulseIcon = L.divIcon({
                className: 'pulse-marker-container',
                html: '<div class="pulse-marker"></div>',
                iconSize: [34, 34],
                iconAnchor: [17, 17]
            });

            searchHighlightMarker = L.marker(latLng, { icon: pulseIcon }).addTo(map);
        });

        searchResults.appendChild(div);
    });

    searchResults.style.display = 'block';
}

// Clear Search Bar Trigger
clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchResults.style.display = 'none';
    if (searchHighlightMarker) {
        map.removeLayer(searchHighlightMarker);
        searchHighlightMarker = null;
    }
});

// Hide dropdown when clicking anywhere else
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
        searchResults.style.display = 'none';
    }
});

// -------------------------------------------------------------------------
// 3. COLOR SCALE & RENTAL STYLING
// -------------------------------------------------------------------------
function getBuildingColor(score) {
    return score > 9.0 ? '#276749' : // Walker's Paradise
           score > 7.0 ? '#48bb78' : // Very Walkable
           score > 5.0 ? '#ecc94b' : // Moderate Access
           score > 3.0 ? '#ed8936' : // Somewhat Isolated
                         '#e53e3e';  // Car Dependent
}

function buildingStyle(feature) {
    const score = feature.properties.final_building_score;
    return {
        fillColor: getBuildingColor(score),
        weight: 0.5,
        opacity: 0.3,
        color: '#ffffff',
        fillOpacity: 0.65
    };
}

let selectedLayer = null;

function highlightFeature(e) {
    const layer = e.target;
    if (selectedLayer && selectedLayer !== layer) {
        activeBuildingsLayer.resetStyle(selectedLayer);
    }
    layer.setStyle({
        weight: 2,
        color: '#1a202c',
        fillOpacity: 0.9
    });
    selectedLayer = layer;
}

// -------------------------------------------------------------------------
// 4. SPATIAL CULLING (DYNAMIC VIEWPORT LOADING)
// -------------------------------------------------------------------------
let allBuildingsData = null; 
const activeBuildingsLayer = L.geoJSON(null, {
    style: buildingStyle,
    onEachFeature: function(feature, layer) {
        layer.on({
            click: highlightFeature,
            mouseover: !L.Browser.mobile ? highlightFeature : null
        });
        
        const props = feature.properties;
        layer.bindPopup(`
            <div style="font-size:13px; line-height: 1.5; color: #2d3748;">
                <strong style="color: #2b6cb0; font-size:14px;">Renter Livability</strong><br/>
                <hr style="margin:6px 0; border:none; border-top:1px solid #e2e8f0;"/>
                <strong>Convenience Score:</strong> <span style="font-size:16px; color:${getBuildingColor(props.final_building_score)}; font-weight:bold;">${props.final_building_score}</span> / 10<br/>
                🚶‍♂️ Transit/Health Dist: <span style="font-weight:600; color:#1a202c;">${props.dist_utility_m}m</span><br/>
                🌳 Green Space Dist: <span style="font-weight:600; color:#1a202c;">${props.dist_green_m}m</span>
            </div>
        `, { closeButton: false, offset: L.point(0, -5) });
    }
}).addTo(map);

function getFeatureLatLng(feature) {
    let coords = feature.geometry.coordinates;
    if (feature.geometry.type === 'MultiPolygon') {
        coords = coords[0][0][0];
    } else if (feature.geometry.type === 'Polygon') {
        coords = coords[0][0];
    }
    return L.latLng(coords[1], coords[0]);
}

function updateVisibleBuildings() {
    if (!allBuildingsData) return;
    const bounds = map.getBounds();
    
    const visibleFeatures = allBuildingsData.features.filter(feature => {
        try {
            const latlng = getFeatureLatLng(feature);
            return bounds.contains(latlng);
        } catch (e) {
            return false;
        }
    });

    activeBuildingsLayer.clearLayers();
    activeBuildingsLayer.addData(visibleFeatures);
}

fetch('buildings.geojson')
    .then(response => response.json())
    .then(data => {
        allBuildingsData = data;
        updateVisibleBuildings();
    });

map.on('moveend', updateVisibleBuildings);

// -------------------------------------------------------------------------
// 5. POINT OF INTEREST MARKERS
// -------------------------------------------------------------------------
function createHTMLIcon(symbol, typeClass) {
    return L.divIcon({
        html: `<div class="custom-marker ${typeClass}">${symbol}</div>`,
        className: 'marker-container',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

fetch('utilities.geojson')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            pointToLayer: function(feature, latlng) {
                const name = feature.properties.names ? JSON.parse(feature.properties.names.replace(/'/g, '"')).primary || 'Facility' : 'Utility Link';
                return L.marker(latlng, { icon: createHTMLIcon('🏥', 'marker-utility') })
                    .bindPopup(`<strong style="color:#2b6cb0;">Transit / Medical Necessity:</strong><br/>${name}`);
            }
        }).addTo(map);
    });

fetch('green_spaces.geojson')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            pointToLayer: function(feature, latlng) {
                const name = feature.properties.names ? JSON.parse(feature.properties.names.replace(/'/g, '"')).primary || 'Park' : 'Green Space';
                return L.marker(latlng, { icon: createHTMLIcon('🌳', 'marker-green') })
                    .bindPopup(`<strong style="color:#2f855a;">Nature & Recreation:</strong><br/>${name}`);
            }
        }).addTo(map);
    });

// -------------------------------------------------------------------------
// 6. LEGEND CONTROL
// -------------------------------------------------------------------------
const legend = L.control({ position: 'bottomright' });
legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'info legend');
    const grades = [0, 3, 5, 7, 9];
    const labels = [
        "Car Dependent (0-3)", 
        "Somewhat Isolated (3-5)", 
        "Moderate Access (5-7)", 
        "Very Walkable (7-9)", 
        "Walker's Paradise (9+)"
    ];

    div.innerHTML += '<h4>Renter Convenience</h4>';
    for (let i = 0; i < grades.length; i++) {
        div.innerHTML +=
            '<i style="background:' + getBuildingColor(grades[i] + 0.1) + '"></i> ' +
            labels[i] + '<br>';
    }
    return div;
};
legend.addTo(map);