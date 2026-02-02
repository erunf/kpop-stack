"""
Map Generator for Laser Etching

Generates black and white map artwork from OpenStreetMap data,
optimized for laser etching on glassware.
"""

import os
import hashlib
import pickle
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Tuple, Literal

import osmnx as ox
import geopandas as gpd
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
from shapely.geometry import Point, box
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

# Configure OSMnx
ox.settings.use_cache = True
ox.settings.cache_folder = Path(__file__).parent.parent / "cache"
ox.settings.log_console = False


@dataclass
class MapConfig:
    """Configuration for map generation."""

    # Location
    lat: float
    lng: float

    # Map extent
    radius_meters: int = 500  # Distance from center point

    # Output settings
    width_inches: float = 9.42  # Beer can glass circumference
    height_inches: float = 4.0   # Etch area height
    dpi: int = 300

    # Style (for etching: black = etch, white = no etch)
    invert: bool = False  # If True, swap black/white
    road_width_base: float = 0.5
    show_buildings: bool = True
    show_water: bool = True
    show_parks: bool = False  # Usually skip for cleaner etch

    # Heart marker
    heart_size: float = 0.15  # Relative to map height


@dataclass
class GeocodingResult:
    """Result from geocoding an address."""
    lat: float
    lng: float
    formatted_address: str
    confidence: str  # 'exact', 'interpolated', 'approximate'


class MapGenerator:
    """Generates etching-ready maps from coordinates or addresses."""

    # Road hierarchy for styling (width multipliers)
    ROAD_HIERARCHY = {
        'motorway': 3.0,
        'trunk': 2.5,
        'primary': 2.0,
        'secondary': 1.5,
        'tertiary': 1.2,
        'residential': 1.0,
        'living_street': 0.8,
        'service': 0.5,
        'footway': 0.3,
        'path': 0.3,
        'cycleway': 0.4,
        'unclassified': 0.8,
    }

    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or Path(__file__).parent.parent / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.geocoder = Nominatim(
            user_agent="map-etcher-glass-art/1.0",
            timeout=10
        )

    def geocode(self, address: str) -> GeocodingResult:
        """Convert address to coordinates."""
        cache_key = hashlib.md5(address.encode()).hexdigest()
        cache_file = self.cache_dir / f"geocode_{cache_key}.pkl"

        # Check cache
        if cache_file.exists():
            with open(cache_file, 'rb') as f:
                return pickle.load(f)

        try:
            location = self.geocoder.geocode(
                address,
                exactly_one=True,
                addressdetails=True
            )

            if not location:
                raise ValueError(f"Could not geocode address: {address}")

            # Determine confidence based on OSM class
            osm_class = location.raw.get('class', '')
            if osm_class in ('building', 'place', 'amenity'):
                confidence = 'exact'
            elif osm_class in ('highway', 'boundary'):
                confidence = 'interpolated'
            else:
                confidence = 'approximate'

            result = GeocodingResult(
                lat=location.latitude,
                lng=location.longitude,
                formatted_address=location.address,
                confidence=confidence
            )

            # Cache result
            with open(cache_file, 'wb') as f:
                pickle.dump(result, f)

            return result

        except (GeocoderTimedOut, GeocoderServiceError) as e:
            raise RuntimeError(f"Geocoding service error: {e}")

    def fetch_map_data(
        self,
        lat: float,
        lng: float,
        radius: int,
        include_buildings: bool = True,
        include_water: bool = True,
        include_parks: bool = False
    ) -> dict:
        """Fetch OpenStreetMap data for the given location."""

        center = (lat, lng)
        data = {'streets': None, 'buildings': None, 'water': None, 'parks': None}

        # Fetch street network
        try:
            graph = ox.graph_from_point(
                center,
                dist=radius,
                network_type='all',
                simplify=True,
                retain_all=False
            )
            # Convert to GeoDataFrame for rendering
            data['streets'] = ox.graph_to_gdfs(graph, nodes=False, edges=True)
        except Exception as e:
            print(f"Warning: Could not fetch streets: {e}")

        # Fetch buildings
        if include_buildings:
            try:
                data['buildings'] = ox.features_from_point(
                    center,
                    tags={'building': True},
                    dist=radius
                )
            except Exception:
                pass  # Buildings are optional

        # Fetch water
        if include_water:
            try:
                water_tags = {
                    'natural': ['water', 'bay', 'strait', 'coastline'],
                    'waterway': ['river', 'stream', 'canal'],
                    'water': True
                }
                data['water'] = ox.features_from_point(
                    center,
                    tags=water_tags,
                    dist=radius
                )
            except Exception:
                pass

        # Fetch parks
        if include_parks:
            try:
                park_tags = {
                    'leisure': ['park', 'garden'],
                    'landuse': ['grass', 'meadow']
                }
                data['parks'] = ox.features_from_point(
                    center,
                    tags=park_tags,
                    dist=radius
                )
            except Exception:
                pass

        return data

    def _get_road_width(self, highway_type: str, base_width: float) -> float:
        """Get road width based on highway type."""
        # Handle lists (some edges have multiple types)
        if isinstance(highway_type, list):
            highway_type = highway_type[0]

        multiplier = self.ROAD_HIERARCHY.get(highway_type, 0.8)
        return base_width * multiplier

    def render_map(
        self,
        config: MapConfig,
        map_data: dict
    ) -> plt.Figure:
        """Render map data to a matplotlib figure."""

        # Set up figure with exact dimensions
        fig, ax = plt.subplots(
            figsize=(config.width_inches, config.height_inches),
            dpi=config.dpi
        )

        # Colors for etching (black = etch area)
        if config.invert:
            bg_color = 'black'
            fg_color = 'white'
        else:
            bg_color = 'white'
            fg_color = 'black'

        ax.set_facecolor(bg_color)
        fig.patch.set_facecolor(bg_color)

        # Calculate bounds for consistent framing
        center_point = Point(config.lng, config.lat)

        # Convert radius to approximate degrees (rough, varies by latitude)
        # 1 degree latitude ≈ 111km
        lat_offset = config.radius_meters / 111000
        # Longitude varies by latitude
        lng_offset = config.radius_meters / (111000 * abs(
            __import__('math').cos(__import__('math').radians(config.lat))
        ))

        bounds = box(
            config.lng - lng_offset,
            config.lat - lat_offset,
            config.lng + lng_offset,
            config.lat + lat_offset
        )

        # Render water (as filled polygons)
        if map_data.get('water') is not None and len(map_data['water']) > 0:
            water = map_data['water']
            # Filter to polygons only
            water_polys = water[water.geometry.type.isin(['Polygon', 'MultiPolygon'])]
            if len(water_polys) > 0:
                water_polys.plot(
                    ax=ax,
                    facecolor=fg_color,
                    edgecolor=fg_color,
                    linewidth=0.5,
                    alpha=0.3  # Lighter fill for water
                )

        # Render parks
        if map_data.get('parks') is not None and len(map_data['parks']) > 0:
            parks = map_data['parks']
            park_polys = parks[parks.geometry.type.isin(['Polygon', 'MultiPolygon'])]
            if len(park_polys) > 0:
                park_polys.plot(
                    ax=ax,
                    facecolor='none',
                    edgecolor=fg_color,
                    linewidth=0.3,
                    linestyle='--',
                    alpha=0.5
                )

        # Render buildings (outlines only for cleaner etch)
        if map_data.get('buildings') is not None and len(map_data['buildings']) > 0:
            buildings = map_data['buildings']
            bldg_polys = buildings[buildings.geometry.type.isin(['Polygon', 'MultiPolygon'])]
            if len(bldg_polys) > 0:
                bldg_polys.plot(
                    ax=ax,
                    facecolor='none',
                    edgecolor=fg_color,
                    linewidth=0.2,
                    alpha=0.6
                )

        # Render streets
        if map_data.get('streets') is not None and len(map_data['streets']) > 0:
            streets = map_data['streets']

            # Sort by road type to draw major roads on top
            for highway_type in reversed(list(self.ROAD_HIERARCHY.keys())):
                if 'highway' in streets.columns:
                    # Filter streets of this type
                    mask = streets['highway'].apply(
                        lambda x: (x == highway_type) if isinstance(x, str)
                        else (highway_type in x if isinstance(x, list) else False)
                    )
                    subset = streets[mask]

                    if len(subset) > 0:
                        width = self._get_road_width(highway_type, config.road_width_base)
                        subset.plot(
                            ax=ax,
                            color=fg_color,
                            linewidth=width,
                            alpha=1.0
                        )

        # Set map bounds
        ax.set_xlim(bounds.bounds[0], bounds.bounds[2])
        ax.set_ylim(bounds.bounds[1], bounds.bounds[3])

        # Remove axes for clean output
        ax.set_axis_off()
        ax.set_aspect('equal')

        # Tight layout
        plt.tight_layout(pad=0)

        return fig

    def add_heart_marker(
        self,
        ax: plt.Axes,
        config: MapConfig,
        color: str = 'black'
    ):
        """Add a heart marker at the center location."""
        # Heart shape using a custom path
        from matplotlib.patches import FancyBboxPatch
        from matplotlib.path import Path as MplPath
        import matplotlib.patches as mpatches
        import numpy as np

        # Heart vertices (normalized, will be scaled)
        t = np.linspace(0, 2 * np.pi, 100)
        x = 16 * np.sin(t) ** 3
        y = 13 * np.cos(t) - 5 * np.cos(2*t) - 2 * np.cos(3*t) - np.cos(4*t)

        # Normalize to -1 to 1 range
        x = x / 16
        y = y / 17

        # Get axes limits to calculate size
        xlim = ax.get_xlim()
        ylim = ax.get_ylim()

        # Scale heart relative to map
        scale_x = (xlim[1] - xlim[0]) * config.heart_size * 0.5
        scale_y = (ylim[1] - ylim[0]) * config.heart_size * 0.5

        # Position at center (the target coordinates)
        heart_x = config.lng + x * scale_x
        heart_y = config.lat + y * scale_y

        ax.fill(heart_x, heart_y, color=color, zorder=100)

    def generate(
        self,
        config: MapConfig,
        add_heart: bool = True
    ) -> plt.Figure:
        """Generate complete map artwork."""

        # Fetch data
        map_data = self.fetch_map_data(
            lat=config.lat,
            lng=config.lng,
            radius=config.radius_meters,
            include_buildings=config.show_buildings,
            include_water=config.show_water,
            include_parks=config.show_parks
        )

        # Render
        fig = self.render_map(config, map_data)

        # Add heart marker
        if add_heart:
            ax = fig.axes[0]
            heart_color = 'white' if config.invert else 'black'
            self.add_heart_marker(ax, config, color=heart_color)

        return fig


def generate_map(
    lat: float,
    lng: float,
    radius: int = 500,
    width: float = 9.42,
    height: float = 4.0,
    dpi: int = 300,
    invert: bool = False,
    add_heart: bool = True
) -> plt.Figure:
    """
    Convenience function to generate a map.

    Args:
        lat: Latitude of center point
        lng: Longitude of center point
        radius: Map radius in meters
        width: Output width in inches
        height: Output height in inches
        dpi: Resolution
        invert: If True, white roads on black background
        add_heart: If True, add heart marker at center

    Returns:
        matplotlib Figure object
    """
    config = MapConfig(
        lat=lat,
        lng=lng,
        radius_meters=radius,
        width_inches=width,
        height_inches=height,
        dpi=dpi,
        invert=invert
    )

    generator = MapGenerator()
    return generator.generate(config, add_heart=add_heart)
