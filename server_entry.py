from flask import jsonify, make_response
import json
from server import app, ROOT

@app.get('/api/campaign-data')
def campaign_data():
    try:
        payload = json.loads((ROOT / 'data.json').read_text(encoding='utf-8'))
        response = make_response(jsonify(payload))
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        return response
    except Exception as e:
        return jsonify({'error': f'No se pudo leer data.json: {e}'}), 500
