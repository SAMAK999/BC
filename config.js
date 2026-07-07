// Configuración principal del mapa.
// Para cambiar la fuente diaria, reemplaza GOOGLE_SHEETS_CSV_URL por el nuevo enlace CSV publicado.

const CONFIG = {
  GOOGLE_SHEETS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJgra9EJjMHBVeSORdTRmTcESvBBiX7NT7PZh1m9fdwI-ngWoYoNisO6EaeCD_-csCsTjIafZxuolW/pub?gid=1506614434&single=true&output=csv',

  // Archivo principal de polígonos. Usa secciones_bc_ine_2254_ligero.geojson si quieres mayor velocidad.
  GEOJSON_URL: 'data/secciones_bc_ine_2254_ligero.geojson',

  MAP_CENTER: [30.3895, -115.3309],
  MAP_ZOOM: 7,

  COLORS: {
    recorrida: '#16a34a',
    pendiente: '#d1d5db',
    sinDatos: '#f97316',
    borde: '#111827',
    bordeHover: '#000000'
  }
};
