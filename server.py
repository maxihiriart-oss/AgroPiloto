
from flask import Flask, send_from_directory, request, jsonify, Response
from pathlib import Path
import sqlite3, json, os, base64, mimetypes, uuid, urllib.request, urllib.parse, secrets
from datetime import datetime

ROOT = Path(__file__).resolve().parent
# En local guarda junto a la app. En nube, DATA_DIR debe apuntar al volumen persistente (ej. /data).
DATA_DIR = Path(os.getenv("DATA_DIR", str(ROOT))).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS = DATA_DIR / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)
DB = DATA_DIR / "agro_copiloto.db"

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")

APP_USER = os.getenv("APP_USER", "agro").strip() or "agro"
APP_PASSWORD = os.getenv("APP_PASSWORD", "").strip()

def _authorized():
    if not APP_PASSWORD:
        return True
    auth = request.authorization
    return bool(auth and secrets.compare_digest(auth.username or "", APP_USER)
                and secrets.compare_digest(auth.password or "", APP_PASSWORD))

@app.before_request
def require_auth():
    # Health queda libre para que Railway pueda verificar el servicio.
    if request.path == "/api/health" or _authorized():
        return None
    return Response("Acceso restringido", 401, {"WWW-Authenticate": 'Basic realm="Agro Copiloto"'})

def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def init_db():
    with conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS app_state(
            id INTEGER PRIMARY KEY CHECK(id=1),
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS photo_analysis(
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            campo TEXT,
            lote TEXT,
            cultivo TEXT,
            analysis_type TEXT,
            notes TEXT,
            image_path TEXT,
            result TEXT
        )""")
        initial_file = ROOT / "initial_state.json"
        try:
            defaults = json.loads(initial_file.read_text(encoding="utf-8")) if initial_file.exists() else {}
        except Exception:
            defaults = {}
        defaults.setdefault("scouts", [])
        defaults.setdefault("photos", [])
        defaults.setdefault("tasks", [])
        defaults.setdefault("validations", {})
        defaults.setdefault("operations", [])
        row = c.execute("SELECT payload FROM app_state WHERE id=1").fetchone()
        if not row:
            c.execute("INSERT INTO app_state(id,payload,updated_at) VALUES(1,?,?)",
                      (json.dumps(defaults, ensure_ascii=False), datetime.now().isoformat()))
        else:
            # Migración no destructiva: agrega nuevas estructuras/eventos semilla sin pisar datos cargados por el usuario.
            try:
                current = json.loads(row["payload"])
            except Exception:
                current = {}
            changed = False
            for key, fallback in (("scouts", []),("photos", []),("tasks", []),("validations", {}),("operations", [])):
                if key not in current:
                    current[key] = fallback.copy() if isinstance(fallback, list) else {}
                    changed = True
            existing_ids = {x.get("id") for x in current.get("operations", []) if isinstance(x, dict)}
            for op in defaults.get("operations", []):
                if op.get("id") and op.get("id") not in existing_ids:
                    current["operations"].append(op); existing_ids.add(op.get("id")); changed = True
            if changed:
                c.execute("UPDATE app_state SET payload=?, updated_at=? WHERE id=1",
                          (json.dumps(current, ensure_ascii=False), datetime.now().isoformat()))

init_db()

@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")

@app.get("/api/health")
def health():
    return {"ok": True, "version": "0.5.1", "data_dir": str(DATA_DIR)}

@app.get("/api/state")
def get_state():
    with conn() as c:
        row = c.execute("SELECT payload FROM app_state WHERE id=1").fetchone()
    return jsonify(json.loads(row["payload"]))

@app.post("/api/state")
def set_state():
    payload = request.get_json(force=True, silent=False)
    with conn() as c:
        c.execute("UPDATE app_state SET payload=?, updated_at=? WHERE id=1",
                  (json.dumps(payload, ensure_ascii=False), datetime.now().isoformat()))
    return {"ok": True}

def build_agro_prompt(analysis_type, campo, lote, cultivo, notes):
    return f"""
Actuá como asistente de diagnóstico agronómico de campo en Uruguay. Priorizá NO sobreafirmar.

Contexto:
- Establecimiento: {campo or 'no indicado'}
- Lote: {lote or 'no indicado'}
- Cultivo informado: {cultivo or 'no indicado'}
- Objetivo: {analysis_type or 'general'}
- Hipótesis/nota del técnico: {notes or 'sin hipótesis'}

REGLAS OBLIGATORIAS:
1. Separá OBSERVADO, INFERIDO y NO VISIBLE.
2. No descartes la hipótesis del técnico salvo que un carácter diagnóstico visible la contradiga.
3. En gramíneas vegetativas (Lolium/raigrás, trigo, cebada, Poa, Bromus, Avena), revisá solo si son visibles: lígula, aurículas, vernación, pilosidad, brillo, nervadura, vaina/base, macollaje e inflorescencia.
4. Si faltan esos caracteres, NO cierres especie: usá "compatible con..." y pedí la foto diagnóstica faltante.
5. Si el técnico propone raigrás y no puede descartarse visualmente, mantenelo entre las hipótesis principales.
6. No afirmes Z30/Z31 si requiere disección y los nudos/ápice no se ven.
7. En enfermedades/deficiencias/daños, separá síntomas compatibles de causa.
8. No recomiendes dosis de fitosanitarios solo por una foto.

FORMATO:
IDENTIFICACIÓN / ESTADIO PROBABLE:
CONFIANZA: Alta / Media / Baja
OBSERVADO:
NO PUEDO CONFIRMAR:
DIFERENCIALES:
PRÓXIMA FOTO / CHEQUEO:
IMPLICANCIA PARA LA RECORRIDA:

Si no alcanza la evidencia, preferí "no concluyente" antes que adivinar.
""".strip()

@app.post("/api/analyze-photo")
def analyze_photo():
    if "image" not in request.files:
        return jsonify({"ok": False, "error": "Falta la imagen"}), 400

    f = request.files["image"]
    campo = request.form.get("campo", "")
    lote = request.form.get("lote", "")
    cultivo = request.form.get("cultivo", "")
    analysis_type = request.form.get("analysis_type", "General")
    notes = request.form.get("notes", "")

    ext = Path(f.filename or "foto.jpg").suffix.lower() or ".jpg"
    photo_id = str(uuid.uuid4())
    save_name = f"{photo_id}{ext}"
    save_path = UPLOADS / save_name
    f.save(save_path)

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip()

    if not api_key:
        result = (
            "La foto quedó guardada correctamente, pero todavía falta conectar la clave de IA. "
            "Cuando agregues OPENAI_API_KEY, este mismo botón hará el análisis automático."
        )
        with conn() as c:
            c.execute("""INSERT INTO photo_analysis
                (id,created_at,campo,lote,cultivo,analysis_type,notes,image_path,result)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                (photo_id, datetime.now().isoformat(), campo, lote, cultivo, analysis_type,
                 notes, str(save_path.name), result))
        return jsonify({"ok": True, "configured": False, "result": result, "photo_id": photo_id})

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        mime = mimetypes.guess_type(save_path.name)[0] or "image/jpeg"
        b64 = base64.b64encode(save_path.read_bytes()).decode("ascii")
        prompt = build_agro_prompt(analysis_type, campo, lote, cultivo, notes)

        response = client.responses.create(
            model=model,
            input=[{
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": f"data:{mime};base64,{b64}"}
                ]
            }]
        )
        result = response.output_text
        configured = True
    except Exception as e:
        result = f"No pude completar el análisis IA: {e}"
        configured = True

    with conn() as c:
        c.execute("""INSERT INTO photo_analysis
            (id,created_at,campo,lote,cultivo,analysis_type,notes,image_path,result)
            VALUES(?,?,?,?,?,?,?,?,?)""",
            (photo_id, datetime.now().isoformat(), campo, lote, cultivo, analysis_type,
             notes, str(save_path.name), result))

    return jsonify({"ok": True, "configured": configured, "result": result, "photo_id": photo_id})


@app.get("/api/weather")
def weather():
    """Historical daily weather for the establishment centroid.
    Operational source: Open-Meteo Archive (ERA5/ERA5-Land). No API key required.
    """
    try:
        start = request.args.get("start", "").strip()
        if not start:
            return jsonify({"error":"Falta fecha de inicio (siembra)"}), 400
        datetime.strptime(start, "%Y-%m-%d")
        lat = float(request.args.get("lat", "-33.456947"))
        lon = float(request.args.get("lon", "-57.606092"))
        end = datetime.now().date().isoformat()
        params = {
            "latitude": f"{lat:.6f}", "longitude": f"{lon:.6f}",
            "start_date": start, "end_date": end,
            "daily": "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration",
            "timezone": "America/Montevideo"
        }
        url = "https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent":"AgroCopiloto/0.5.1"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
        dd = raw.get("daily") or {}
        dates = dd.get("time") or []
        rows=[]
        for i,date in enumerate(dates):
            def val(key):
                a=dd.get(key) or []
                return a[i] if i < len(a) else None
            rows.append({
                "date":date,
                "tmax":val("temperature_2m_max"), "tmin":val("temperature_2m_min"),
                "tmean":val("temperature_2m_mean"), "precipitation":val("precipitation_sum"),
                "et0":val("et0_fao_evapotranspiration")
            })
        if not rows:
            return jsonify({"error":"La fuente meteorológica no devolvió datos para el período"}), 502
        def nums(key): return [float(r[key]) for r in rows if r.get(key) is not None]
        pr=nums("precipitation"); tmin=nums("tmin"); tmax=nums("tmax"); tm=nums("tmean"); et0=nums("et0")
        longest=cur=0
        for r in rows:
            if float(r.get("precipitation") or 0) < 1.0:
                cur += 1; longest=max(longest,cur)
            else: cur=0
        events=[]
        for r in rows:
            p=float(r.get("precipitation") or 0); mn=r.get("tmin"); mx=r.get("tmax")
            if mn is not None and mn < 0:
                events.append({"date":r["date"],"priority":2,"text":f"Helada / Tmin {mn:.1f} °C"})
            if p >= 30:
                events.append({"date":r["date"],"priority":2,"text":f"Lluvia intensa {p:.1f} mm"})
            elif p >= 15:
                events.append({"date":r["date"],"priority":1,"text":f"Lluvia {p:.1f} mm"})
            if mx is not None and mx >= 30:
                events.append({"date":r["date"],"priority":1,"text":f"Temperatura máxima alta {mx:.1f} °C"})
        events=sorted(events,key=lambda x:(x["priority"],x["date"]),reverse=True)[:12]
        precipitation=sum(pr) if pr else 0
        et0sum=sum(et0) if et0 else 0
        summary={
            "precipitation_mm":precipitation,
            "rain_days":sum(1 for x in pr if x>=1),
            "frost_days":sum(1 for x in tmin if x<0),
            "min_temp_c":min(tmin) if tmin else None,
            "max_temp_c":max(tmax) if tmax else None,
            "mean_temp_c":sum(tm)/len(tm) if tm else None,
            "et0_mm":et0sum,
            "water_balance_mm":precipitation-et0sum,
            "longest_dry_spell":longest,
            "days":len(rows)
        }
        return jsonify({
            "ok":True,"source":"Open-Meteo Archive · ERA5/ERA5-Land (dato gridded, no estación)",
            "latitude":lat,"longitude":lon,"start_date":rows[0]["date"],"end_date":rows[-1]["date"],
            "summary":summary,"events":events,"daily":rows
        })
    except urllib.error.HTTPError as e:
        return jsonify({"error":f"Fuente meteorológica respondió HTTP {e.code}"}), 502
    except Exception as e:
        return jsonify({"error":str(e)}), 500


@app.get("/api/forecast")
def forecast():
    """10-day operational weather forecast for the establishment centroid.
    Source: Open-Meteo Forecast API. This endpoint is intentionally descriptive:
    the client decides whether a weather/phenology coincidence deserves an alert.
    """
    try:
        lat = float(request.args.get("lat", "-33.456947"))
        lon = float(request.args.get("lon", "-57.606092"))
        days = int(request.args.get("days", "10"))
        days = max(3, min(days, 16))
        params = {
            "latitude": f"{lat:.6f}", "longitude": f"{lon:.6f}",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,et0_fao_evapotranspiration",
            "timezone": "America/Montevideo",
            "forecast_days": str(days)
        }
        url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent":"AgroCopiloto/0.5.1"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
        dd = raw.get("daily") or {}
        dates = dd.get("time") or []
        rows = []
        for i, date in enumerate(dates):
            def val(key):
                arr = dd.get(key) or []
                return arr[i] if i < len(arr) else None
            rows.append({
                "date": date,
                "tmax": val("temperature_2m_max"),
                "tmin": val("temperature_2m_min"),
                "precipitation": val("precipitation_sum"),
                "precipitation_probability": val("precipitation_probability_max"),
                "wind_gusts": val("wind_gusts_10m_max"),
                "et0": val("et0_fao_evapotranspiration")
            })
        if not rows:
            return jsonify({"error":"La fuente de pronóstico no devolvió datos"}), 502

        def n(v):
            try: return float(v)
            except (TypeError, ValueError): return None

        pr=[n(r.get("precipitation")) or 0 for r in rows]
        tmins=[n(r.get("tmin")) for r in rows if n(r.get("tmin")) is not None]
        tmaxs=[n(r.get("tmax")) for r in rows if n(r.get("tmax")) is not None]
        gusts=[n(r.get("wind_gusts")) for r in rows if n(r.get("wind_gusts")) is not None]
        probs=[n(r.get("precipitation_probability")) for r in rows if n(r.get("precipitation_probability")) is not None]
        et0=[n(r.get("et0")) or 0 for r in rows]
        first7=rows[:7]
        summary={
            "precipitation_mm": sum(pr),
            "precipitation_7d_mm": sum((n(r.get("precipitation")) or 0) for r in first7),
            "rain_days": sum(1 for x in pr if x >= 1),
            "frost_days": sum(1 for x in tmins if x < 0),
            "min_temp_c": min(tmins) if tmins else None,
            "max_temp_c": max(tmaxs) if tmaxs else None,
            "max_wind_gust_kmh": max(gusts) if gusts else None,
            "max_precipitation_probability": max(probs) if probs else None,
            "et0_mm": sum(et0),
            "days": len(rows)
        }
        return jsonify({
            "ok": True,
            "source": "Open-Meteo Forecast API · Best Match (pronóstico modelado)",
            "latitude": lat, "longitude": lon,
            "start_date": rows[0]["date"], "end_date": rows[-1]["date"],
            "summary": summary, "daily": rows
        })
    except urllib.error.HTTPError as e:
        return jsonify({"error":f"Fuente de pronóstico respondió HTTP {e.code}"}), 502
    except Exception as e:
        return jsonify({"error":str(e)}), 500

@app.get("/uploads/<path:name>")
def uploaded(name):
    return send_from_directory(UPLOADS, name)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8090")), debug=False)
