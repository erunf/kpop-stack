#!/usr/bin/env python3
"""
Test script for map-etcher service.

Run this to verify the map generation and composition works correctly.

Usage:
    python test_generate.py
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from map_generator import MapGenerator, MapConfig
from glass_composer import (
    GlassComposer,
    CompositionConfig,
    TextConfig,
    GlassSize,
    create_glass_artwork
)


def test_geocoding():
    """Test address geocoding."""
    print("Testing geocoding...")

    generator = MapGenerator()

    # Test with a well-known address
    result = generator.geocode("Empire State Building, New York, NY")

    print(f"  Address: {result.formatted_address}")
    print(f"  Coordinates: {result.lat}, {result.lng}")
    print(f"  Confidence: {result.confidence}")

    # Verify coordinates are roughly correct (Empire State Building)
    assert 40.74 < result.lat < 40.75, "Latitude out of range"
    assert -73.99 < result.lng < -73.98, "Longitude out of range"

    print("  [PASS] Geocoding works correctly\n")
    return result


def test_map_generation(lat: float, lng: float):
    """Test map data fetching and rendering."""
    print("Testing map generation...")

    config = MapConfig(
        lat=lat,
        lng=lng,
        radius_meters=300,
        width_inches=9.42,
        height_inches=4.0,
        dpi=150,  # Lower DPI for faster testing
    )

    generator = MapGenerator()
    fig = generator.generate(config, add_heart=True)

    # Verify figure was created
    assert fig is not None, "Figure is None"
    assert len(fig.axes) > 0, "No axes in figure"

    # Save test output
    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)

    test_path = output_dir / "test_map.png"
    fig.savefig(test_path, dpi=150, bbox_inches='tight', pad_inches=0)

    print(f"  Saved test map to: {test_path}")
    print(f"  File size: {test_path.stat().st_size / 1024:.1f} KB")
    print("  [PASS] Map generation works correctly\n")

    import matplotlib.pyplot as plt
    plt.close(fig)


def test_glass_composition():
    """Test full glass artwork composition."""
    print("Testing glass composition...")

    # Use coordinates directly to avoid rate limiting
    composer = GlassComposer()

    config = CompositionConfig(
        lat=40.7484,
        lng=-73.9857,
        glass_size=GlassSize.CAN_16OZ,
        map_radius=300,
        show_heart=True,
        text=TextConfig(
            content="Our Place",
            position="bottom",
            uppercase=True
        ),
        dpi=150,  # Lower DPI for faster testing
        invert=False,
    )

    artwork = composer.compose(config)

    # Verify outputs
    assert artwork.png_bytes is not None, "PNG bytes are None"
    assert len(artwork.png_bytes) > 0, "PNG bytes are empty"
    assert artwork.svg_string is not None, "SVG string is None"
    assert len(artwork.svg_string) > 0, "SVG string is empty"

    print(f"  PNG size: {len(artwork.png_bytes) / 1024:.1f} KB")
    print(f"  SVG size: {len(artwork.svg_string) / 1024:.1f} KB")
    print(f"  Dimensions: {artwork.width_px} x {artwork.height_px} px")
    print(f"  Print size: {artwork.width_inches}\" x {artwork.height_inches}\"")

    # Save outputs
    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)

    png_path = output_dir / "test_glass.png"
    svg_path = output_dir / "test_glass.svg"

    with open(png_path, 'wb') as f:
        f.write(artwork.png_bytes)

    with open(svg_path, 'w') as f:
        f.write(artwork.svg_string)

    print(f"  Saved PNG to: {png_path}")
    print(f"  Saved SVG to: {svg_path}")
    print("  [PASS] Glass composition works correctly\n")


def test_convenience_function():
    """Test the create_glass_artwork convenience function."""
    print("Testing convenience function...")

    output_dir = Path(__file__).parent / "output"

    png_path, svg_path = create_glass_artwork(
        address="Statue of Liberty, New York",
        custom_text="Freedom",
        glass_size="16oz",
        output_dir=str(output_dir),
        dpi=150
    )

    assert Path(png_path).exists(), "PNG file not created"
    assert Path(svg_path).exists(), "SVG file not created"

    print(f"  Created: {png_path}")
    print(f"  Created: {svg_path}")
    print("  [PASS] Convenience function works correctly\n")


def test_inverted_output():
    """Test inverted (white on black) output."""
    print("Testing inverted output...")

    composer = GlassComposer()

    config = CompositionConfig(
        lat=51.5074,
        lng=-0.1278,  # London
        glass_size=GlassSize.CAN_16OZ,
        map_radius=400,
        show_heart=True,
        text=TextConfig(content="London", position="bottom"),
        dpi=150,
        invert=True,  # White on black
    )

    artwork = composer.compose(config)

    output_dir = Path(__file__).parent / "output"
    png_path = output_dir / "test_inverted.png"

    with open(png_path, 'wb') as f:
        f.write(artwork.png_bytes)

    print(f"  Saved inverted output to: {png_path}")
    print("  [PASS] Inverted output works correctly\n")


def main():
    """Run all tests."""
    print("=" * 60)
    print("MAP ETCHER TEST SUITE")
    print("=" * 60)
    print()

    try:
        # Run tests
        geo_result = test_geocoding()
        test_map_generation(geo_result.lat, geo_result.lng)
        test_glass_composition()
        test_convenience_function()
        test_inverted_output()

        print("=" * 60)
        print("ALL TESTS PASSED!")
        print("=" * 60)
        print()
        print("Check the 'output' directory for generated test files.")

    except Exception as e:
        print(f"\n[FAIL] Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
