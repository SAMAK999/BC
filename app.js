'use strict';

const state = {
  map: null,
  geojsonLayer: null,
  labelLayer: null,
  activePopup: null,
  geojsonData: null,
  sheetRowsBySection: new Map(),
  availableViews: ['ACUMULADO_GENERAL'],
  vueltaColumns: [],
  showSectionLabels: false,
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
  clearSearchBtn: $('clearSearchBtn'),
  recorridaSwatch: $('recorridaSwatch'),
  recorridaLegendText: $('recorridaLegendText'),
  legendNote: $('legendNote')
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
  if (!els.statusText) return;
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

  if (rows.length === 0) return { headers: [], data: [] };
  const headers = rows[0].map((h) => String(h).replace(/^\uFEFF/, '').trim());
  const data = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? String(r[idx]).trim() : '';
    });
    return obj;
  });

  return { headers, data };
}

async function fetchText(url) {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}_=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function viewLabel(view) {
  if (view === 'ACUMULADO_GENERAL') return 'Acumulado general';
  const n = getVueltaNumber(view);
  return n ? `Vuelta ${n}` : view;
}

function getVueltaNumber(view) {
  const match = normalizeText(view).match(/^VUELTA[_\s-]*(\d+)$/);
  return match ? Number(match[1]) : null;
}

function isVueltaColumn(name) {
  return /^VUELTA_\d+$/i.test(normalizeText(name));
}

function sortVueltaColumns(cols) {
  return [...cols].sort((a, b) => (getVueltaNumber(a) || 0) - (getVueltaNumber(b) || 0));
}

function detectViews(headers) {
  const vueltas = sortVueltaColumns(headers.filter(isVueltaColumn));
  state.vueltaColumns = vueltas;
  state.availableViews = ['ACUMULADO_GENERAL', ...vueltas];

  if (!state.availableViews.includes(state.selectedView)) {
    state.selectedView = 'ACUMULADO_GENERAL';
  }

  populateViewSelect();
}

function populateViewSelect() {
  if (!els.viewSelect) return;
  els.viewSelect.innerHTML = '';
  state.availableViews.forEach((view) => {
    const option = document.createElement('option');
    option.value = view;
    option.textContent = viewLabel(view);
    els.viewSelect.appendChild(option);
  });
  els.viewSelect.value = state.selectedView;
}

async function loadSheetData() {
  setStatus('Cargando datos desde Google Sheets...');
  const csvText = await fetchText(CONFIG.GOOGLE_SHEETS_CSV_URL);
  const parsed = csvParse(csvText);
  const rows = parsed.data.filter((row) => normalizeKey(row.SECCION));

  detectViews(parsed.headers);

  const map = new Map();
  rows.forEach((row) => {
    const key = normalizeKey(row.SECCION);
    map.set(key, row);
  });

  state.sheetRowsBySection = map;
  if (els.updatedText) els.updatedText.textContent = `Última lectura: ${new Date().toLocaleString('es-MX')}`;
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

  state.map.on('click', () => {
    clearSelection();
  });
}

function prop(feature, names, fallback = '') {
  for (const name of names) {
    if (feature.properties && feature.properties[name] !== undefined && feature.properties[name] !== null && feature.properties[name] !== '') {
      return feature.properties[name];
    }
  }
  return fallback;
}

function getFeatureSection(feature) {
  return normalizeKey(prop(feature, ['SECCION', 'SECCION_ID', 'SECC', 'SEC']));
}

function getRowForFeature(feature) {
  return state.sheetRowsBySection.get(getFeatureSection(feature)) || null;
}

function isRecorridaValue(value) {
  const text = normalizeText(value);
  return text === '1' || text === 'RECORRIDA' || text === 'SI' || text === 'SÍ' || text === 'TRUE';
}

function isPendienteValue(value) {
  const text = normalizeText(value);
  return text === '0' || text === 'P' || text === 'PENDIENTE' || text === '' || text === 'FALSE';
}

function getRowStats(row) {
  if (!row) return { recorridas: 0, ultimaVuelta: '', acumulado: 0 };

  let recorridas = 0;
  let ultimaVuelta = '';

  state.vueltaColumns.forEach((col) => {
    if (isRecorridaValue(row[col])) {
      recorridas++;
      ultimaVuelta = col;
    }
  });

  return {
    recorridas,
    ultimaVuelta,
    acumulado: recorridas > 0 ? 1 : 0
  };
}

function getStatus(feature) {
  const row = getRowForFeature(feature);
  if (!row) return 'SIN_DATOS';

  if (state.selectedView === 'ACUMULADO_GENERAL') {
    return getRowStats(row).acumulado === 1 ? 'RECORRIDA' : 'PENDIENTE';
  }

  const value = row[state.selectedView];
  if (isRecorridaValue(value)) return 'RECORRIDA';
  if (isPendienteValue(value)) return 'PENDIENTE';
  return 'SIN_DATOS';
}

function getVueltaColor(view) {
  const key = normalizeText(view);
  if (CONFIG.VUELTA_COLORS && CONFIG.VUELTA_COLORS[key]) return CONFIG.VUELTA_COLORS[key];

  const n = getVueltaNumber(key);
  if (!n) return CONFIG.COLORS.recorrida;

  const hue = (n * 47) % 360;
  return `hsl(${hue}, 58%, 48%)`;
}

function getRecorridaColor(feature) {
  const row = getRowForFeature(feature);

  if (state.selectedView !== 'ACUMULADO_GENERAL') {
    return getVueltaColor(state.selectedView);
  }

  const stats = getRowStats(row);
  return stats.ultimaVuelta ? getVueltaColor(stats.ultimaVuelta) : CONFIG.COLORS.recorrida;
}

function featureMatchesFilters(feature) {
  const status = getStatus(feature);
  const props = feature.properties || {};

  if (state.filters.estatus !== 'TODOS' && status !== state.filters.estatus) return false;
  if (state.filters.municipio !== 'TODOS' && normalizeText(prop(feature, ['MUNICIPIO', 'NOMBRE_MUN', 'MUN'])) !== state.filters.municipio) return false;
  if (state.filters.dl !== 'TODOS' && normalizeKey(prop(feature, ['DL', 'DISTRITO_L', 'DISTRITO_LOCAL'])) !== state.filters.dl) return false;

  return true;
}

function getStyle(feature) {
  const status = getStatus(feature);
  const visible = featureMatchesFilters(feature);
  const selected = state.selectedLayer && state.selectedLayer.feature === feature;

  let fillColor = CONFIG.COLORS.sinDatos;
  if (status === 'RECORRIDA') fillColor = getRecorridaColor(feature);
  if (status === 'PENDIENTE') fillColor = CONFIG.COLORS.pendiente;

  return {
    color: selected ? CONFIG.COLORS.seleccion : CONFIG.COLORS.borde,
    weight: selected ? 3.2 : (visible ? 0.65 : 0.25),
    opacity: selected ? 1 : (visible ? 0.72 : 0.12),
    fillColor,
    fillOpacity: selected ? 0.90 : (visible ? 0.72 : 0.05),
    interactive: true
  };
}

function getValorVista(row) {
  if (!row) return 'Sin coincidencia en CSV';
  if (state.selectedView === 'ACUMULADO_GENERAL') return getRowStats(row).acumulado;
  return row[state.selectedView] ?? '';
}

function getFeatureInfo(feature) {
  const row = getRowForFeature(feature);
  const status = getStatus(feature);
  const selected = state.selectedView;
  const stats = getRowStats(row);

  return {
    seccion: getFeatureSection(feature),
    municipio: prop(feature, ['MUNICIPIO', 'NOMBRE_MUN', 'MUN']),
    distritoLocal: prop(feature, ['DL', 'DISTRITO_L', 'DISTRITO_LOCAL']),
    distritoFederal: prop(feature, ['DF', 'DISTRITO_F', 'DISTRITO_FEDERAL']),
    vista: viewLabel(selected).toUpperCase(),
    estatus: status,
    valorVista: getValorVista(row),
    vueltasRecorridas: row ? stats.recorridas : '',
    ultimaVuelta: row ? (stats.ultimaVuelta || 'SIN RECORRIDO') : '',
    acumulado: row ? stats.acumulado : '',
    coincideSheets: row ? 'Sí' : 'No'
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function infoGridHtml(info, titleClass = 'popup-title') {
  return `
    <div class="${titleClass}">Sección ${escapeHtml(info.seccion)}</div>
    <div class="popup-grid">
      <span>Municipio</span><strong>${escapeHtml(info.municipio)}</strong>
      <span>Distrito local</span><strong>${escapeHtml(info.distritoLocal)}</strong>
      <span>Distrito federal</span><strong>${escapeHtml(info.distritoFederal)}</strong>
      <span>Vista</span><strong>${escapeHtml(info.vista)}</strong>
      <span>Estatus</span><strong>${escapeHtml(info.estatus)}</strong>
      <span>Valor en vista</span><strong>${escapeHtml(info.valorVista)}</strong>
      <span>Vueltas recorridas</span><strong>${escapeHtml(info.vueltasRecorridas)}</strong>
      <span>Última vuelta</span><strong>${escapeHtml(info.ultimaVuelta)}</strong>
      <span>Acumulado</span><strong>${escapeHtml(info.acumulado)}</strong>
      <span>Coincide en Sheets</span><strong>${escapeHtml(info.coincideSheets)}</strong>
    </div>
  `;
}

function updateInfoPanel(feature, locked = false) {
  if (!els.hoverInfo || !feature) return;
  els.hoverInfo.classList.remove('hover-empty');
  els.hoverInfo.innerHTML = `${locked ? '<div class="locked-label">Sección seleccionada</div>' : '<div class="hover-label">Vista rápida</div>'}${infoGridHtml(getFeatureInfo(feature), 'hover-title')}`;
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

function openInfoPopup(layer, latlng = null, locked = false) {
  if (!state.map || !layer) return;
  const content = `<div class="map-info-card ${locked ? 'locked' : ''}">${locked ? '<div class="locked-label">Seleccionada</div>' : ''}${infoGridHtml(getFeatureInfo(layer.feature), 'popup-title')}</div>`;
  const center = latlng || layer.getBounds().getCenter();
  if (!state.activePopup) {
    state.activePopup = L.popup({ closeButton: true, autoPan: true, maxWidth: 340, className: 'section-popup-card' });
  }
  state.activePopup.setLatLng(center).setContent(content).openOn(state.map);
}

function closeHoverPopupIfNotSelected() {
  if (!state.selectedLayer && state.activePopup && state.map) {
    state.map.closePopup(state.activePopup);
  }
}

function setLayerHighlight(layer, isStrong = false) {
  if (!layer) return;
  layer.setStyle({
    weight: isStrong ? 3.2 : 2.2,
    color: isStrong ? CONFIG.COLORS.seleccion : CONFIG.COLORS.bordeHover,
    opacity: 1,
    fillOpacity: isStrong ? 0.90 : 0.82
  });
  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) layer.bringToFront();
}

function onEachFeature(feature, layer) {
  layer.options.interactive = true;

  layer.on({
    mouseover: (event) => {
      updateInfoPanel(feature, false);
      setLayerHighlight(layer, false);
      openInfoPopup(layer, event.latlng, false);
    },
    mousemove: (event) => {
      if (!state.selectedLayer) {
        // Mueve la tarjeta del mapa junto al cursor solo cuando no hay sección fija.
        if (state.activePopup) state.activePopup.setLatLng(event.latlng);
      }
    },
    mouseout: () => {
      if (state.geojsonLayer) state.geojsonLayer.resetStyle(layer);
      if (state.selectedLayer) setLayerHighlight(state.selectedLayer, true);
      resetInfoPanel();
      closeHoverPopupIfNotSelected();
    },
    click: (event) => {
      L.DomEvent.stopPropagation(event);
      selectLayer(layer, true, event.latlng);
    }
  });
}

function selectLayer(layer, openPopup = true, latlng = null) {
  if (!layer) return;
  if (state.selectedLayer && state.selectedLayer !== layer && state.geojsonLayer) {
    state.geojsonLayer.resetStyle(state.selectedLayer);
  }
  state.selectedLayer = layer;
  setLayerHighlight(layer, true);
  updateInfoPanel(layer.feature, true);
  if (openPopup) openInfoPopup(layer, latlng || layer.getBounds().getCenter(), true);
}

function clearSelection() {
  if (state.selectedLayer && state.geojsonLayer) {
    state.geojsonLayer.resetStyle(state.selectedLayer);
  }
  state.selectedLayer = null;
  if (state.activePopup && state.map) state.map.closePopup(state.activePopup);
  resetInfoPanel();
}

function renderGeoJSON() {
  if (state.geojsonLayer) {
    state.geojsonLayer.remove();
  }

  state.geojsonLayer = L.geoJSON(state.geojsonData, {
    interactive: true,
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
        html: `<span>${escapeHtml(getFeatureSection(feature))}</span>`,
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
  });
  if (state.selectedLayer) setLayerHighlight(state.selectedLayer, true);
  renderSectionLabels();
  resetInfoPanel();
  updateMetrics();
  updateLegend();
}

function populateFilters() {
  const municipios = new Set();
  const dls = new Set();

  state.geojsonData.features.forEach((feature) => {
    const mun = normalizeText(prop(feature, ['MUNICIPIO', 'NOMBRE_MUN', 'MUN']));
    const dl = normalizeKey(prop(feature, ['DL', 'DISTRITO_L', 'DISTRITO_LOCAL']));
    if (mun) municipios.add(mun);
    if (dl) dls.add(dl);
  });

  setSelectOptions(els.municipioSelect, [...municipios].sort((a, b) => a.localeCompare(b, 'es')), 'TODOS', 'Todos');
  setSelectOptions(els.dlSelect, [...dls].sort((a, b) => Number(a) - Number(b)), 'TODOS', 'Todos');
}

function setSelectOptions(select, values, defaultValue, defaultLabel) {
  if (!select) return;
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
  if (els.totalMetric) els.totalMetric.textContent = numberFormat(total);
  if (els.recorridasMetric) els.recorridasMetric.textContent = numberFormat(recorridas);
  if (els.pendientesMetric) els.pendientesMetric.textContent = numberFormat(pendientes);
  if (els.sinDatosMetric) els.sinDatosMetric.textContent = numberFormat(sinDatos);
  if (els.avanceMetric) els.avanceMetric.textContent = percentFormat(avance);
  if (els.progressBar) els.progressBar.style.width = `${Math.min(100, Math.max(0, avance))}%`;
}

function updateLegend() {
  if (!els.recorridaSwatch || !els.recorridaLegendText) return;

  if (state.selectedView === 'ACUMULADO_GENERAL') {
    els.recorridaSwatch.style.background = CONFIG.COLORS.recorrida;
    els.recorridaLegendText.textContent = 'Recorrida acumulada';
    if (els.legendNote) els.legendNote.textContent = 'En acumulado, cada sección recorrida se pinta con el color de su última vuelta recorrida.';
  } else {
    const color = getVueltaColor(state.selectedView);
    els.recorridaSwatch.style.background = color;
    els.recorridaLegendText.textContent = `Recorrida (${viewLabel(state.selectedView)})`;
    if (els.legendNote) els.legendNote.textContent = `Color activo: ${viewLabel(state.selectedView)}.`;
  }
}

function findLayerBySection(sectionNumber) {
  const target = normalizeKey(sectionNumber);
  if (!target || !state.geojsonLayer) return null;
  let found = null;
  state.geojsonLayer.eachLayer((layer) => {
    if (normalizeKey(getFeatureSection(layer.feature)) === target) found = layer;
  });
  return found;
}

function searchSection() {
  const value = normalizeKey(els.sectionSearch ? els.sectionSearch.value : '');
  if (!value) {
    setStatus('Escribe un número de sección para buscar.', true);
    return;
  }

  const layer = findLayerBySection(value);
  if (!layer) {
    setStatus(`No se encontró la sección ${value}.`, true);
    return;
  }

  if (state.selectedLayer && state.selectedLayer !== layer && state.geojsonLayer) {
    state.geojsonLayer.resetStyle(state.selectedLayer);
  }

  const bounds = layer.getBounds();
  state.map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14, animate: true });
  selectLayer(layer, true, bounds.getCenter());
  setStatus(`Sección ${value} localizada. La tarjeta quedó fija en el panel lateral.`);

  // Refuerza selección después del zoom porque Leaflet puede recalcular estilos durante la animación.
  window.setTimeout(() => {
    selectLayer(layer, true, layer.getBounds().getCenter());
    renderSectionLabels();
  }, 350);
}

function attachEvents() {
  if (els.viewSelect) {
    els.viewSelect.addEventListener('change', (event) => {
      state.selectedView = event.target.value;
      refreshLayerStyles();
    });
  }

  if (els.municipioSelect) {
    els.municipioSelect.addEventListener('change', (event) => {
      state.filters.municipio = event.target.value;
      refreshLayerStyles();
    });
  }

  if (els.dlSelect) {
    els.dlSelect.addEventListener('change', (event) => {
      state.filters.dl = event.target.value;
      refreshLayerStyles();
    });
  }

  if (els.estatusSelect) {
    els.estatusSelect.addEventListener('change', (event) => {
      state.filters.estatus = event.target.value;
      refreshLayerStyles();
    });
  }

  if (els.labelToggle) {
    els.labelToggle.checked = state.showSectionLabels;
    els.labelToggle.addEventListener('change', (event) => {
      state.showSectionLabels = event.target.checked;
      renderSectionLabels();
    });
  }

  if (els.searchBtn) {
    els.searchBtn.addEventListener('click', (event) => {
      event.preventDefault();
      searchSection();
    });
  }

  if (els.sectionSearch) {
    els.sectionSearch.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchSection();
      }
    });
  }

  if (els.clearSearchBtn) {
    els.clearSearchBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (els.sectionSearch) els.sectionSearch.value = '';
      clearSelection();
      refreshLayerStyles();
      setStatus('Selección limpiada.');
    });
  }

  if (els.reloadBtn) {
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
}

async function main() {
  try {
    initMap();
    attachEvents();
    await Promise.all([loadGeoJSON(), loadSheetData()]);
    populateFilters();
    renderGeoJSON();
    updateMetrics();
    updateLegend();
    resetInfoPanel();
    setStatus('Mapa listo. Pasa el cursor, da clic o busca una sección para ver su tarjeta.');
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`, true);
  }
}

main();
