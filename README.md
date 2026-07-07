# Mapa dinámico de secciones — Baja California

Este paquete publica un visor web en GitHub Pages con cartografía de secciones electorales de Baja California y datos operativos desde Google Sheets.

## Archivos principales

- `index.html`: visor principal.
- `style.css`: diseño visual.
- `app.js`: lógica del mapa, filtros y conteos.
- `config.js`: configuración de enlaces.
- `data/secciones_bc_ine_2254.geojson`: polígonos de secciones INE.
- `data/secciones_bc_ine_2254_ligero.geojson`: versión más ligera de polígonos.

## Fuente dinámica actual

La fuente configurada en `config.js` es:

```text
https://docs.google.com/spreadsheets/d/e/2PACX-1vQJgra9EJjMHBVeSORdTRmTcESvBBiX7NT7PZh1m9fdwI-ngWoYoNisO6EaeCD_-csCsTjIafZxuolW/pub?gid=1506614434&single=true&output=csv
```

La hoja debe tener columnas:

```text
SECCION, MUNICIPIO, DL, VUELTA_1, ..., VUELTA_15, VUELTAS_RECORRIDAS, ULTIMA_VUELTA, ACUMULADO_GENERAL, ESTATUS_ACUMULADO
```

## Regla de lectura

- `1` = recorrida.
- `0` = pendiente.
- `ACUMULADO_GENERAL = 1` = recorrida acumulada.
- `ACUMULADO_GENERAL = 0` = pendiente acumulada.

## Publicación en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `mapa-bc-julio`.
2. Sube todos los archivos y carpetas de este paquete a la raíz del repositorio.
3. Entra a `Settings` → `Pages`.
4. En `Build and deployment`, selecciona:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Guarda.
6. GitHub generará una URL parecida a:

```text
https://TU_USUARIO.github.io/mapa-bc-julio/
```

## Actualización diaria

No hay que modificar código. Solo actualiza la hoja `Base` en Google Sheets. La hoja `Mapa_Web` se recalcula y el mapa lee el CSV publicado.

En el visor, usa el botón `Recargar datos` para volver a leer el CSV sin esperar caché del navegador.

## Si el mapa se siente pesado

Abre `config.js` y cambia:

```js
GEOJSON_URL: 'data/secciones_bc_ine_2254.geojson'
```

por:

```js
GEOJSON_URL: 'data/secciones_bc_ine_2254_ligero.geojson'
```
