// Configuración principal del mapa.
// Para cambiar la fuente diaria, reemplaza GOOGLE_SHEETS_CSV_URL por el nuevo enlace CSV publicado.

const CONFIG = {
  GOOGLE_SHEETS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJgra9EJjMHBVeSORdTRmTcESvBBiX7NT7PZh1m9fdwI-ngWoYoNisO6EaeCD_-csCsTjIafZxuolW/pub?gid=1506614434&single=true&output=csv',

  // Archivo principal de polígonos. La versión ligera mejora la carga en GitHub Pages.
  GEOJSON_URL: 'data/secciones_bc_ine_2254_ligero.geojson',

  MAP_CENTER: [30.3895, -115.3309],
  MAP_ZOOM: 7,

  // Los números de sección solo aparecen a partir de este zoom para evitar saturación visual.
  LABEL_MIN_ZOOM: 11,

  COLORS: {
    recorrida: '#16a34a',
    pendiente: '#d1d5db',
    sinDatos: '#f97316',
    borde: '#111827',
    bordeHover: '#000000',
    seleccion: '#facc15'
  },

  // Paleta profesional por vuelta. Si en el futuro agregas VUELTA_31 o mayor,
  // el mapa generará un color automático sin repetir exactamente los anteriores.
  VUELTA_COLORS: {
    VUELTA_1: '#F4A261',
    VUELTA_2: '#8B1E0D',
    VUELTA_3: '#6AA84F',
    VUELTA_4: '#2A9D8F',
    VUELTA_5: '#3D8FD1',
    VUELTA_6: '#2F6DB2',
    VUELTA_7: '#7E57C2',
    VUELTA_8: '#C77DFF',
    VUELTA_9: '#E76F51',
    VUELTA_10: '#D4A017',
    VUELTA_11: '#8BC34A',
    VUELTA_12: '#00897B',
    VUELTA_13: '#00ACC1',
    VUELTA_14: '#5E35B1',
    VUELTA_15: '#D81B60',
    VUELTA_16: '#6D4C41',
    VUELTA_17: '#546E7A',
    VUELTA_18: '#FB8C00',
    VUELTA_19: '#43A047',
    VUELTA_20: '#1E88E5',
    VUELTA_21: '#8E24AA',
    VUELTA_22: '#C0CA33',
    VUELTA_23: '#F4511E',
    VUELTA_24: '#3949AB',
    VUELTA_25: '#039BE5',
    VUELTA_26: '#7CB342',
    VUELTA_27: '#FDD835',
    VUELTA_28: '#00838F',
    VUELTA_29: '#AD1457',
    VUELTA_30: '#455A64'
  }
};
