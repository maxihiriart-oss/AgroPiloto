# Agro Copiloto v0.5.0 · Santa María de Bequelo

## Qué agrega esta versión

- Mantiene la base v0.4.2: 27 unidades de lote, 149 labores reconstruidas, fechas/variedades respaldadas por planilla madre, recorridas, prescripciones, sanidad, clima histórico y fenología estimada.
- Nuevo panel **Copiloto · próximos 10 días** en Inicio.
- Nuevo bloque **Alertas predictivas** dentro de cada ficha de lote.
- El motor cruza: última recorrida + fenología estimada + prescripciones pendientes + receta sanitaria + pronóstico meteorológico.
- Pronóstico automático de 10 días mediante Open-Meteo Forecast API, usando el centroide de Santa María de Bequelo.
- Alertas de seguimiento para:
  - hitos fenológicos próximos (Zadoks/BBCH),
  - prescripción C1/Z30 pendiente cuando el cereal ya está en encañado,
  - fungicida Único 0,550 L/ha planificado en trigo,
  - heladas pronosticadas coincidentes con etapa activa/reproductiva estimada,
  - lluvias que pueden complicar piso/ingreso,
  - semana seca como señal de seguimiento hídrico,
  - ráfagas fuertes que obligan a revisar condiciones horarias antes de pulverizar,
  - biomasa/riesgo de vuelco en cebada cuando la recorrida lo justifica,
  - heterogeneidad/anegamiento/helada/stand ralo registrados en la última recorrida,
  - NDVI pendiente de cuantificar en Isletas 13.
- En Inicio, las alertas meteorológicas generales se muestran una sola vez a escala establecimiento para evitar duplicados por lote.

## Criterio agronómico

Las alertas son **señales de seguimiento**, no recomendaciones automáticas. No sustituyen recorrida, etiqueta, decisión técnica ni condiciones reales de aplicación. Una coincidencia entre pronóstico y estadio se muestra como coincidencia, no como diagnóstico de daño.

La fenología de trigo/cebada continúa siendo una proyección operacional calibrada por Zadoks observado; INIA se mantiene como referencia para estimación de floración. En colza se mantiene la curva BBCH local estimada y recalibrable.

## Abrir

1. Ejecutar `INSTALAR.bat` sólo si faltan dependencias.
2. Ejecutar `ABRIR_APP.bat`.
3. Abre en http://localhost:8090

## Fuentes meteorológicas

- Histórico: Open-Meteo Archive / ERA5-ERA5 Land.
- Pronóstico: Open-Meteo Forecast API / Best Match.
- INUMET e INIA GRAS quedan como referencias oficiales de contraste para eventos y series agroclimáticas.


## v0.5.0 móvil/cloud
Preparada para Railway: PORT dinámico, volumen persistente con DATA_DIR, acceso opcional con contraseña, Gunicorn y PWA/offline mejorado. Ver DEPLOYAR_RAILWAY.md.
