#!/usr/bin/env python3
"""
Map Etcher HTTP API

Simple Flask API for generating glass etching artwork.
Can be run standalone or behind a reverse proxy.

Usage:
    python api.py  # Runs on port 5000
    PORT=8080 python api.py  # Custom port
"""

import os
import io
import json
import hashlib
import tempfile
from pathlib import Path
from datetime import datetime

from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS

from map_generator import MapGenerator, MapConfig
from glass_composer import (
    GlassComposer,
    CompositionConfig,
    TextConfig,
    GlassSize,
    GLASS_SPECS
)

app = Flask(__name__)
CORS(app)

# Initialize services
map_generator = MapGenerator()
glass_composer = GlassComposer()

# Output directory
OUTPUT_DIR = Path(os.environ.get('OUTPUT_DIR', '/tmp/map-etcher'))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0'
    })


@app.route('/geocode', methods=['POST'])
def geocode():
    """
    Geocode an address.

    Request body:
    {
        "address": "123 Main St, City, State 12345"
    }

    Returns:
    {
        "lat": 40.7128,
        "lng": -74.0060,
        "formatted_address": "123 Main Street, ...",
        "confidence": "exact"
    }
    """
    data = request.get_json()

    if not data or 'address' not in data:
        return jsonify({'error': 'Missing address field'}), 400

    try:
        result = map_generator.geocode(data['address'])
        return jsonify({
            'lat': result.lat,
            'lng': result.lng,
            'formatted_address': result.formatted_address,
            'confidence': result.confidence
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': f'Geocoding failed: {str(e)}'}), 500


@app.route('/generate', methods=['POST'])
def generate():
    """
    Generate glass etching artwork.

    Request body:
    {
        "address": "123 Main St, City, State",  // or use lat/lng
        "lat": 40.7128,
        "lng": -74.0060,
        "text": "Our First Home",  // optional
        "text_position": "bottom",  // "top", "bottom", "both"
        "glass_size": "16oz",  // "16oz", "20oz", "pint"
        "radius": 400,  // meters
        "dpi": 300,
        "invert": false,
        "show_buildings": true,
        "show_water": true,
        "show_heart": true
    }

    Returns:
    {
        "order_id": "abc123",
        "png_url": "/files/abc123.png",
        "svg_url": "/files/abc123.svg",
        "width_px": 2826,
        "height_px": 1200,
        "width_inches": 9.42,
        "height_inches": 4.0
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Missing request body'}), 400

    # Get coordinates
    lat = data.get('lat')
    lng = data.get('lng')
    address = data.get('address')

    if address and (lat is None or lng is None):
        try:
            result = map_generator.geocode(address)
            lat = result.lat
            lng = result.lng
        except Exception as e:
            return jsonify({'error': f'Geocoding failed: {str(e)}'}), 400

    if lat is None or lng is None:
        return jsonify({'error': 'Must provide address or lat/lng'}), 400

    # Parse glass size
    glass_size_str = data.get('glass_size', '16oz')
    size_map = {
        '16oz': GlassSize.CAN_16OZ,
        '20oz': GlassSize.CAN_20OZ,
        'pint': GlassSize.PINT,
    }
    glass_size = size_map.get(glass_size_str, GlassSize.CAN_16OZ)

    # Build text config
    text_config = None
    if data.get('text'):
        text_config = TextConfig(
            content=data['text'],
            position=data.get('text_position', 'bottom'),
            uppercase=data.get('uppercase', True)
        )

    # Build composition config
    config = CompositionConfig(
        lat=lat,
        lng=lng,
        address=address,
        glass_size=glass_size,
        map_radius=data.get('radius', 400),
        show_buildings=data.get('show_buildings', True),
        show_water=data.get('show_water', True),
        show_heart=data.get('show_heart', True),
        text=text_config,
        dpi=data.get('dpi', 300),
        invert=data.get('invert', False),
    )

    try:
        # Generate artwork
        artwork = glass_composer.compose(config)

        # Generate order ID
        order_id = hashlib.md5(
            f"{lat}{lng}{datetime.utcnow().isoformat()}".encode()
        ).hexdigest()[:12]

        # Save files
        png_path = OUTPUT_DIR / f"{order_id}.png"
        svg_path = OUTPUT_DIR / f"{order_id}.svg"

        with open(png_path, 'wb') as f:
            f.write(artwork.png_bytes)

        with open(svg_path, 'w') as f:
            f.write(artwork.svg_string)

        return jsonify({
            'order_id': order_id,
            'png_url': f'/files/{order_id}.png',
            'svg_url': f'/files/{order_id}.svg',
            'width_px': artwork.width_px,
            'height_px': artwork.height_px,
            'width_inches': artwork.width_inches,
            'height_inches': artwork.height_inches,
            'lat': lat,
            'lng': lng,
        })

    except Exception as e:
        return jsonify({'error': f'Generation failed: {str(e)}'}), 500


@app.route('/generate/preview', methods=['POST'])
def generate_preview():
    """
    Generate a low-resolution preview (faster, smaller file).
    Same parameters as /generate but returns inline base64.
    """
    data = request.get_json() or {}
    data['dpi'] = 72  # Low res for preview

    # Use same logic as generate but return base64
    lat = data.get('lat')
    lng = data.get('lng')
    address = data.get('address')

    if address and (lat is None or lng is None):
        try:
            result = map_generator.geocode(address)
            lat = result.lat
            lng = result.lng
        except Exception as e:
            return jsonify({'error': f'Geocoding failed: {str(e)}'}), 400

    if lat is None or lng is None:
        return jsonify({'error': 'Must provide address or lat/lng'}), 400

    glass_size_str = data.get('glass_size', '16oz')
    size_map = {
        '16oz': GlassSize.CAN_16OZ,
        '20oz': GlassSize.CAN_20OZ,
        'pint': GlassSize.PINT,
    }
    glass_size = size_map.get(glass_size_str, GlassSize.CAN_16OZ)

    text_config = None
    if data.get('text'):
        text_config = TextConfig(
            content=data['text'],
            position=data.get('text_position', 'bottom'),
            uppercase=data.get('uppercase', True)
        )

    config = CompositionConfig(
        lat=lat,
        lng=lng,
        glass_size=glass_size,
        map_radius=data.get('radius', 400),
        show_buildings=data.get('show_buildings', True),
        show_water=data.get('show_water', True),
        show_heart=data.get('show_heart', True),
        text=text_config,
        dpi=72,
        invert=data.get('invert', False),
    )

    try:
        artwork = glass_composer.compose(config)

        import base64
        png_base64 = base64.b64encode(artwork.png_bytes).decode('utf-8')

        return jsonify({
            'preview': f'data:image/png;base64,{png_base64}',
            'width_px': artwork.width_px,
            'height_px': artwork.height_px,
        })

    except Exception as e:
        return jsonify({'error': f'Preview failed: {str(e)}'}), 500


@app.route('/files/<filename>', methods=['GET'])
def get_file(filename):
    """Serve generated files."""
    file_path = OUTPUT_DIR / filename

    if not file_path.exists():
        return jsonify({'error': 'File not found'}), 404

    if filename.endswith('.png'):
        return send_file(file_path, mimetype='image/png')
    elif filename.endswith('.svg'):
        return send_file(file_path, mimetype='image/svg+xml')
    else:
        return jsonify({'error': 'Invalid file type'}), 400


@app.route('/specs', methods=['GET'])
def get_specs():
    """Get glass specifications."""
    specs = {}
    for size, spec in GLASS_SPECS.items():
        specs[size.value] = {
            'circumference_inches': spec.circumference_inches,
            'etch_height_inches': spec.etch_height_inches,
            'bleed_inches': spec.bleed_inches,
            'safe_width_inches': spec.safe_width,
            'safe_height_inches': spec.safe_height,
        }
    return jsonify(specs)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'

    print(f"Starting Map Etcher API on port {port}")
    print(f"Output directory: {OUTPUT_DIR}")

    app.run(host='0.0.0.0', port=port, debug=debug)
