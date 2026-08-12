# Agro Copiloto v0.5.0 — despliegue móvil

## Variables recomendadas en Railway

- `DATA_DIR=/data`
- `APP_USER=agro`
- `APP_PASSWORD=<una contraseña fuerte>`
- `OPENAI_API_KEY=<tu clave>` (opcional para análisis de fotos)
- `OPENAI_MODEL=gpt-4.1-mini` (opcional)

## Persistencia

Crear un Volume en Railway y montarlo en `/data`. La base SQLite y las fotos se guardan allí.

## Inicio

El proyecto incluye `railway.json` y `Procfile`. El comando de producción es:

`gunicorn server:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`

## iPhone

Abrir la URL pública en Safari > Compartir > Añadir a pantalla de inicio > Abrir como app.

## Offline

La interfaz y `data.json` se cachean. Las recorridas y cambios se guardan primero en el teléfono; si no hay señal quedan marcados para sincronizar y se envían al volver la conexión. Las fotos requieren conexión para subirse/analizarse.
