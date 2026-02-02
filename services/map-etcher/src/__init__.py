"""
Map Etcher Service

Generates laser-etching artwork for beer can glasses from addresses.
"""

from .map_generator import (
    MapGenerator,
    MapConfig,
    GeocodingResult,
    generate_map,
)

from .glass_composer import (
    GlassComposer,
    GlassSize,
    GlassSpecs,
    GLASS_SPECS,
    CompositionConfig,
    TextConfig,
    ComposedArtwork,
    create_glass_artwork,
)

__version__ = '1.0.0'

__all__ = [
    # Map generation
    'MapGenerator',
    'MapConfig',
    'GeocodingResult',
    'generate_map',

    # Glass composition
    'GlassComposer',
    'GlassSize',
    'GlassSpecs',
    'GLASS_SPECS',
    'CompositionConfig',
    'TextConfig',
    'ComposedArtwork',
    'create_glass_artwork',
]
