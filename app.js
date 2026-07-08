'use strict';

const state = {
  map: null,
  geojsonLayer: null,
  labelLayer: null,
  geojsonData: null,
  sheetRowsBySection: new Map(),
  showSectionLabels: true,
  selectedView: 'ACUMULADO_GENERAL',
  selectedLayer: null,
  filters: {
    municipio: 'TODOS',
    dl: 'TODOS',
    estatus: 'TODOS'
  }
};

const $ = (id) => document.getElementById(id);

const els = {
  viewSelect: $('viewSelect'),
  municipioSelect: $('municipioSelect'),
  dlSelect: $('dlSelect'),
  estatusSelect: $('estatusSelect'),
  reloadBtn: $('reloadBtn'),
  statusText: $('statusText'),
  updatedText: $('updatedText'),
  totalMetric: $('totalMetric'),
  recorridasMetric: $('recorridasMetric'),
  pendientesMetric: $('pendientesMetric'),
  sinDatosMetric: $('sinDatosMetric'),
  avanceMetric: $('avanceMetric'),
  progressBar: $('progressBar'),
  labelToggle: $('labelToggle'),
  hoverInfo: $('hoverInfo'),
  sectionSearch: $('sectionSearch'),
  searchBtn: $('searchBtn'),
  clearSearchBtn: $('clearSearchBtn')
};

function normalizeKey(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().replace(/\.0$/, '');
}

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toUpperCase();
}

function numberFormat(value) {
  return new Intl.NumberFormat('es-MX').format(value);
}

function percentFormat(value) {
  return `${value.toFixed(1)}%`;
}

function setStatus(message, isError = false) {
  els.statusText.textContent = message;
  els.statusText.style.color = isError ? '#dc2626' : '#374151';
}

function csvParse(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some((v) => String(v).trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((v) => String(v).trim() !== '')) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? String(r[idx]).trim() : '';
    });
    return obj;
  });
}

async function fetchText(url) {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}_=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function loadSheetData() {
  setStatus('Cargando datos desde Google Sheets...');
  const csvText = await fetchText(CONFIG.GOOGLE_SHEETS_CSV_URL);
  const rows = csvParse(csvText).filter((row) => normalizeKey(row.SECCION));

  const map = new Map();
  rows.forEach((row) => {
    const key = normalizeKey(row.SECCION);
    map.set(key, row);
  });

  state.sheetRowsBySection = map;
  els.updatedText.textContent = `Última lectura: ${new Date().toLocaleString('es-MX')}`;
  setStatus(`Datos cargados: ${numberFormat(rows.length)} secciones en Google Sheets.`);
}

async function loadGeoJSON() {
  setStatus('Cargando cartografía INE...');
  const response = await fetch(CONFIG.GEOJSON_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`No se pudo cargar GeoJSON: HTTP ${response.status}`);
  state.geojsonData = await response.json();
}

function initMap() {
  state.map = L.map('map', {
    zoomControl: true,
    minZoom: 6,
    maxZoom: 18
  }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);

  state.map.on('zoomend moveend', () => {
    renderSectionLabels();
  });
}

function getFeatureSection(feature) {
  return normalizeKey(feature.properties.SECCION);
}

function getRowForFeature(feature) {
  return state.sheetRowsBySection.get(getFeatureSection(feature)) || null;
}

function getStatus(feature) {
  const row = getRowForFeature(feature);
  if (!row) return 'SIN_DATOS';

  const selected = state.selectedView;
  const value = normalizeText(row[selected]);

  if (value === '1' || value === 'RECORRIDA') return 'RECORRIDA';
  if (value === '0' || value === 'P' || value === 'PENDIENTE' || value === '') return 'PENDIENTE';
  return 'SIN_DATOS';
}

function featureMatchesFilters(feature) {
  const status = getStatus(feature);
  const props = feature.properties;

  if (state.filters.estatus !== 'TODOS' && status !== state.filters.estatus) return false;
  if (state.filters.municipio !== 'TODOS' && normalizeText(props.MUNICIPIO) !== state.filters.municipio) return false;
  if (state.filters.dl !== 'TODOS' && normalizeKey(props.DL) !== state.filters.dl) return false;

  return true;
}

function getStyle(feature) {
  const status = getStatus(feature);
  const visible = featureMatchesFilters(feature);
  const selected = state.selectedLayer && state.selectedLayer.feature === feature;

  let fillColor = CONFIG.COLORS.sinDatos;
  if (status === 'RECORRIDA') fillColor = CONFIG.COLORS.recorrida;
  if (status === 'PENDIENTE') fillColor = CONFIG.COLORS.pendiente;

  return {
    color: selected ? CONFIG.COLORS.seleccion : CONFIG.COLORS.borde,
    weight: selected ? 3 : (visible ? 0.65 : 0.25),
    opacity: selected ? 1 : (visible ? 0.7 : 0.12),
    fillColor,
    fillOpacity: visible ? 0.72 : 0.05
  };
}

function getFeatureInfo(feature) {
  const props = feature.properties;
  const row = getRowForFeature(feature);
  const status = getStatus(feature);
  const selected = state.selectedView;

  return {
    seccion: props.SECCION ?? '',
    municipio: props.MUNICIPIO || '',
    distritoLocal: props.DL ?? '',
    distritoFederal: props.DF ?? '',
    vista: selected,
    estatus: status,
    valorVista: row ? (row[selected] ?? '') : 'Sin coincidencia en CSV',
    vueltasRecorridas: row ? (row.VUELTAS_RECORRIDAS ?? '') : '',
    ultimaVuelta: row ? (row.ULTIMA_VUELTA ?? '') : '',
    acumulado: row ? (row.ACUMULADO_GENERAL ?? '') : '',
    coincideSheets: row ? 'Sí' : 'No'
  };
}

function infoGridHtml(info, titleClass = 'popup-title') {
  return `
    <div class="${titleClass}">Sección ${info.seccion}</div>
    <div class="popup-grid">
      <span>Municipio</span><strong>${info.municipio}</strong>
      <span>Distrito local</span><strong>${info.distritoLocal}</strong>
      <span>Distrito federal</span><strong>${info.distritoFederal}</strong>
      <span>Vista</span><strong>${info.vista}</strong>
      <span>Estatus</span><strong>${info.estatus}</strong>
      <span>Valor en vista</span><strong>${info.valorVista}</strong>
      <span>Vueltas recorridas</span><strong>${info.vueltasRecorridas}</strong>
      <span>Última vuelta</span><strong>${info.ultimaVuelta}</strong>
      <span>Acumulado</span><strong>${info.acumulado}</strong>
      <span>Coincide en Sheets</span><strong>${info.coincideSheets}</strong>
    </div>
  `;
}

function popupContent(feature) {
  return infoGridHtml(getFeatureInfo(feature));
}

function updateInfoPanel(feature, locked = false) {
  if (!els.hoverInfo) return;
  els.hoverInfo.classList.remove('hover-empty');
  els.hoverInfo.innerHTML = `${locked ? '<div class="locked-label">Sección seleccionada</div>' : ''}${infoGridHtml(getFeatureInfo(feature), 'hover-title')}`;
}

function resetInfoPanel() {
  if (!els.hoverInfo) return;
  if (state.selectedLayer) {
    updateInfoPanel(state.selectedLayer.feature, true);
    return;
  }
  els.hoverInfo.classList.add('hover-empty');
  els.hoverInfo.textContent = 'Pasa el cursor sobre un polígono o busca una sección.';
}

function onEachFeature(feature, layer) {
  layer.bindPopup(() => popupContent(feature));

  layer.on('mouseover', () => {
    updateInfoPanel(feature);
    layer.setStyle({ weight: 2, color: CONFIG.COLORS.bordeHover, opacity: 1 });
    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) layer.bringToFront();
  });

  layer.on('mouseout', () => {
    if (state.geojsonLayer) state.geojsonLayer.resetStyle(layer);
    if (state.selectedLayer) state.selectedLayer.setStyle(getStyle(state.selectedLayer.feature));
    resetInfoPanel();
  });

  layer.on('click', () => {
    selectLayer(layer, true);
  });
}

function selectLayer(layer, openPopup = false) {
  if (state.selectedLayer && state.selectedLayer !== layer) {
    state.geojsonLayer.resetStyle(state.selectedLayer);
  }
  state.selectedLayer = layer;
  layer.setStyle(getStyle(layer.feature));
  updateInfoPanel(layer.feature, true);
  if (openPopup) layer.openPopup();
}

function clearSelection() {
  if (state.selectedLayer && state.geojsonLayer) {
    state.geojsonLayer.resetStyle(state.selectedLayer);
  }
  state.selectedLayer = null;
  resetInfoPanel();
}

function renderGeoJSON() {
  if (state.geojsonLayer) {
    state.geojsonLayer.remove();
  }

  state.geojsonLayer = L.geoJSON(state.geojsonData, {
    style: getStyle,
    onEachFeature
  }).addTo(state.map);

  state.map.invalidateSize();
  state.map.fitBounds(state.geojsonLayer.getBounds(), { padding: [18, 18], maxZoom: 8 });
  renderSectionLabels();
}

function getLabelLatLng(feature) {
  if (feature._labelLatLng) return feature._labelLatLng;
  const tempLayer = L.geoJSON(feature);
  feature._labelLatLng = tempLayer.getBounds().getCenter();
  return feature._labelLatLng;
}

function renderSectionLabels() {
  if (state.labelLayer) {
    state.labelLayer.remove();
  }

  state.labelLayer = L.layerGroup();

  const minZoom = CONFIG.LABEL_MIN_ZOOM || 11;
  if (!state.showSectionLabels || !state.geojsonData || state.map.getZoom() < minZoom) {
    state.labelLayer.addTo(state.map);
    return;
  }

  const bounds = state.map.getBounds().pad(0.08);
  state.geojsonData.features.forEach((feature) => {
    if (!featureMatchesFilters(feature)) return;
    const latLng = getLabelLatLng(feature);
    if (!bounds.contains(latLng)) return;

    const marker = L.marker(latLng, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'section-number-label',
        html: `<span>${feature.properties.SECCION}</span>`,
        iconSize: [42, 18],
        iconAnchor: [21, 9]
      })
    });

    marker.addTo(state.labelLayer);
  });

  state.labelLayer.addTo(state.map);
}

function refreshLayerStyles() {
  if (!state.geojsonLayer) return;
  state.geojsonLayer.eachLayer((layer) => {
    layer.setStyle(getStyle(layer.feature));
    if (layer.getPopup()) layer.setPopupContent(popupContent(layer.feature));
  });
  renderSectionLabels();
  resetInfoPanel();
  updateMetrics();
}

function populateFilters() {
  const municipios = new Set();
  const dls = new Set();

  state.geojsonData.features.forEach((feature) => {
    if (feature.properties.MUNICIPIO) municipios.add(normalizeText(feature.properties.MUNICIPIO));
    if (feature.properties.DL !== undefined && feature.properties.DL !== null) dls.add(normalizeKey(feature.properties.DL));
  });

  setSelectOptions(els.municipioSelect, [...municipios].sort((a, b) => a.localeCompare(b, 'es')), 'TODOS', 'Todos');
  setSelectOptions(els.dlSelect, [...dls].sort((a, b) => Number(a) - Number(b)), 'TODOS', 'Todos');
}

function setSelectOptions(select, values, defaultValue, defaultLabel) {
  select.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = defaultValue;
  defaultOption.textContent = defaultLabel;
  select.appendChild(defaultOption);

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function updateMetrics() {
  let total = 0;
  let recorridas = 0;
  let pendientes = 0;
  let sinDatos = 0;

  state.geojsonData.features.forEach((feature) => {
    if (!featureMatchesFilters(feature)) return;
    total++;
    const status = getStatus(feature);
    if (status === 'RECORRIDA') recorridas++;
    else if (status === 'PENDIENTE') pendientes++;
    else sinDatos++;
  });

  const avance = total > 0 ? (recorridas / total) * 100 : 0;
  els.totalMetric.textContent = numberFormat(total);
  els.recorridasMetric.textContent = numberFormat(recorridas);
  els.pendientesMetric.textContent = numberFormat(pendientes);
  els.sinDatosMetric.textContent = numberFormat(sinDatos);
  els.avanceMetric.textContent = percentFormat(avance);
  els.progressBar.style.width = `${Math.min(100, Math.max(0, avance))}%`;
}

function findLayerBySection(sectionNumber) {
  const target = normalizeKey(sectionNumber);
  if (!target || !state.geojsonLayer) return null;
  let found = null;
  state.geojsonLayer.eachLayer((layer) => {
    if (normalizeKey(layer.feature.properties.SECCION) === target) found = layer;
  });
  return found;
}

function searchSection() {
  const value = normalizeKey(els.sectionSearch.value);
  if (!value) return;

  const layer = findLayerBySection(value);
  if (!layer) {
    setStatus(`No se encontró la sección ${value}.`, true);
    return;
  }

  clearSelection();
  const bounds = layer.getBounds();
  state.map.fitBounds(bounds, { padding: [45, 45], maxZoom: 13 });
  selectLayer(layer, true);
  setStatus(`Sección ${value} localizada.`);
}

function attachEvents() {
  els.viewSelect.addEventListener('change', (event) => {
    state.selectedView = event.target.value;
    refreshLayerStyles();
  });

  els.municipioSelect.addEventListener('change', (event) => {
    state.filters.municipio = event.target.value;
    refreshLayerStyles();
  });

  els.dlSelect.addEventListener('change', (event) => {
    state.filters.dl = event.target.value;
    refreshLayerStyles();
  });

  els.estatusSelect.addEventListener('change', (event) => {
    state.filters.estatus = event.target.value;
    refreshLayerStyles();
  });

  if (els.labelToggle) {
    els.labelToggle.addEventListener('change', (event) => {
      state.showSectionLabels = event.target.checked;
      renderSectionLabels();
    });
  }

  if (els.searchBtn) {
    els.searchBtn.addEventListener('click', searchSection);
  }

  if (els.sectionSearch) {
    els.sectionSearch.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') searchSection();
    });
  }

  if (els.clearSearchBtn) {
    els.clearSearchBtn.addEventListener('click', () => {
      els.sectionSearch.value = '';
      clearSelection();
      refreshLayerStyles();
    });
  }

  els.reloadBtn.addEventListener('click', async () => {
    try {
      els.reloadBtn.disabled = true;
      await loadSheetData();
      refreshLayerStyles();
    } catch (error) {
      console.error(error);
      setStatus(`Error al recargar: ${error.message}`, true);
    } finally {
      els.reloadBtn.disabled = false;
    }
  });
}

async function main() {
  try {
    initMap();
    attachEvents();
    await Promise.all([loadGeoJSON(), loadSheetData()]);
    populateFilters();
    renderGeoJSON();
    updateMetrics();
    setStatus('Mapa listo. Vista limpia para presentación; los detalles aparecen en el panel lateral.');
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`, true);
  }
}

main();
