# Map Etcher

Generate laser-etching artwork for beer can glasses from street addresses.

## Features

- Convert any address to stylized black & white map artwork
- Optimized for laser etching on glassware
- Heart marker at the exact location
- Custom text support ("Our First Home", "Where We Met", etc.)
- Multiple glass size presets
- Output in both PNG and SVG formats
- HTTP API for integration with other services

## Quick Start

### Installation

```bash
cd services/map-etcher

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt
```

### CLI Usage

```bash
cd src

# Generate artwork from an address
python cli.py generate \
  --address "350 Fifth Avenue, New York, NY 10118" \
  --text "Empire State" \
  --output ../output

# Generate with coordinates instead
python cli.py generate \
  --lat 40.7484 \
  --lng -73.9857 \
  --text "NYC" \
  --glass-size 16oz

# Preview geocoding without generating
python cli.py preview --address "1600 Pennsylvania Ave, Washington DC"

# Show glass specifications
python cli.py specs

# Batch processing
python cli.py batch \
  "123 Main St, Boston, MA" \
  "456 Oak Ave, Chicago, IL" \
  --text "Home"
```

### API Usage

```bash
# Start the API server
python src/api.py

# Or with custom port
PORT=8080 python src/api.py
```

API endpoints:

```bash
# Health check
curl http://localhost:5000/health

# Geocode an address
curl -X POST http://localhost:5000/geocode \
  -H "Content-Type: application/json" \
  -d '{"address": "350 Fifth Avenue, New York, NY"}'

# Generate artwork
curl -X POST http://localhost:5000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "address": "350 Fifth Avenue, New York, NY",
    "text": "Our Place",
    "glass_size": "16oz"
  }'

# Get glass specifications
curl http://localhost:5000/specs
```

### Python API

```python
from src import create_glass_artwork, GlassComposer, CompositionConfig

# Simple usage
png_path, svg_path = create_glass_artwork(
    address="123 Main St, Anytown, USA",
    custom_text="Home Sweet Home",
    glass_size="16oz",
    output_dir="./output"
)

# Advanced usage
composer = GlassComposer()
artwork = composer.compose_from_address(
    address="123 Main St, Anytown, USA",
    custom_text="Our First Home",
    glass_size=GlassSize.CAN_16OZ,
    map_radius=500,
    invert=False,
    dpi=300
)

# Access results
png_bytes = artwork.png_bytes
svg_string = artwork.svg_string
```

## Glass Specifications

| Size | Circumference | Etch Height | Safe Area |
|------|---------------|-------------|-----------|
| 16oz Beer Can | 9.42" | 4.0" | 9.17" x 3.75" |
| 20oz Beer Can | 10.21" | 4.5" | 9.96" x 4.25" |
| Pint | 11.0" | 4.0" | 10.75" x 3.75" |

## Output Format

### For Laser Etching

- **PNG**: 300 DPI raster image, black and white
- **SVG**: Vector format, preferred for clean laser paths
- **Colors**: Black = etch area, White = no etch (use `--invert` to swap)

### File Naming

```
glass_etch_{hash}.png
glass_etch_{hash}.svg
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `radius` | 400 | Map radius in meters |
| `dpi` | 300 | Output resolution |
| `invert` | false | Swap black/white |
| `show_buildings` | true | Include building outlines |
| `show_water` | true | Include water features |
| `show_heart` | true | Show heart marker at location |
| `text_position` | bottom | Where to place text: top, bottom, both |
| `uppercase` | true | Convert text to uppercase |

## Architecture

```
services/map-etcher/
├── src/
│   ├── __init__.py         # Package exports
│   ├── map_generator.py    # OSM data fetching & rendering
│   ├── glass_composer.py   # Artwork composition
│   ├── cli.py              # Command-line interface
│   └── api.py              # HTTP API server
├── fonts/                  # Custom fonts (optional)
├── cache/                  # OSM data cache
├── output/                 # Generated files
└── requirements.txt
```

## Integration with Order Pipeline

This service is designed to be called from the order processing pipeline:

```
Etsy Order → Parse Address → Map Etcher API → Upload to Storage → Send to Fulfillment
```

Example integration:

```javascript
// From Node.js order processor
const response = await fetch('http://localhost:5000/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    address: order.customization.address,
    text: order.customization.phrase,
    glass_size: '16oz'
  })
});

const { png_url, svg_url } = await response.json();

// Upload to R2/S3 for fulfillment
await uploadToStorage(png_url, `orders/${order.id}/print.png`);
```

## Dependencies

- **osmnx**: OpenStreetMap data fetching
- **matplotlib**: Map rendering
- **Pillow**: Image processing
- **svgwrite**: SVG generation
- **geopy**: Geocoding via Nominatim
- **Flask**: HTTP API

## License

Internal use only.
