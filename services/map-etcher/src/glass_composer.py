"""
Glass Wrap Composer

Creates wrap-around artwork for beer can glass laser etching.
Combines map, heart marker, and custom text into a single design.
"""

import io
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Literal, Tuple
from enum import Enum

import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from PIL import Image
import svgwrite
from svgwrite import cm, mm

from map_generator import MapGenerator, MapConfig


class GlassSize(Enum):
    """Standard beer can glass sizes."""
    CAN_16OZ = "16oz"      # Standard beer can glass
    CAN_20OZ = "20oz"      # Larger pint-style
    PINT = "pint"          # Traditional pint


@dataclass
class GlassSpecs:
    """Physical specifications for glass etching."""
    circumference_inches: float  # Wrap-around distance
    etch_height_inches: float    # Usable etch area height
    bleed_inches: float = 0.125  # Safety margin

    @property
    def total_width(self) -> float:
        return self.circumference_inches

    @property
    def total_height(self) -> float:
        return self.etch_height_inches

    @property
    def safe_width(self) -> float:
        return self.circumference_inches - (self.bleed_inches * 2)

    @property
    def safe_height(self) -> float:
        return self.etch_height_inches - (self.bleed_inches * 2)


# Standard glass specifications
GLASS_SPECS = {
    GlassSize.CAN_16OZ: GlassSpecs(
        circumference_inches=9.42,  # ~3" diameter
        etch_height_inches=4.0,
    ),
    GlassSize.CAN_20OZ: GlassSpecs(
        circumference_inches=10.21,  # ~3.25" diameter
        etch_height_inches=4.5,
    ),
    GlassSize.PINT: GlassSpecs(
        circumference_inches=11.0,  # ~3.5" diameter at widest
        etch_height_inches=4.0,
    ),
}


@dataclass
class TextConfig:
    """Configuration for text on the glass."""
    content: str
    position: Literal['top', 'bottom', 'both'] = 'bottom'
    font_family: str = 'serif'
    font_size_ratio: float = 0.08  # Relative to height
    letter_spacing: float = 0.15   # em units
    uppercase: bool = True


@dataclass
class CompositionConfig:
    """Full configuration for glass artwork."""
    # Location
    lat: float
    lng: float
    address: Optional[str] = None

    # Glass
    glass_size: GlassSize = GlassSize.CAN_16OZ

    # Map settings
    map_radius: int = 400
    show_buildings: bool = True
    show_water: bool = True

    # Text
    text: Optional[TextConfig] = None

    # Output
    dpi: int = 300
    invert: bool = False  # False = black on white (standard for etching)

    # Heart marker
    show_heart: bool = True
    heart_size: float = 0.12


@dataclass
class ComposedArtwork:
    """Result of composition process."""
    png_bytes: bytes
    svg_string: str
    width_px: int
    height_px: int
    width_inches: float
    height_inches: float
    config: CompositionConfig


class GlassComposer:
    """Composes artwork for beer can glass etching."""

    def __init__(self, font_dir: Optional[Path] = None):
        self.font_dir = font_dir or Path(__file__).parent.parent / "fonts"
        self.map_generator = MapGenerator()

        # Register any custom fonts
        self._register_fonts()

    def _register_fonts(self):
        """Register custom fonts from font directory."""
        if not self.font_dir.exists():
            self.font_dir.mkdir(parents=True, exist_ok=True)
            return

        for font_file in self.font_dir.glob("*.ttf"):
            try:
                fm.fontManager.addfont(str(font_file))
            except Exception:
                pass

        for font_file in self.font_dir.glob("*.otf"):
            try:
                fm.fontManager.addfont(str(font_file))
            except Exception:
                pass

    def _calculate_layout(
        self,
        specs: GlassSpecs,
        text_config: Optional[TextConfig]
    ) -> dict:
        """Calculate layout regions for map and text."""
        layout = {
            'total_width': specs.total_width,
            'total_height': specs.total_height,
            'map_x': specs.bleed_inches,
            'map_y': specs.bleed_inches,
            'map_width': specs.safe_width,
            'map_height': specs.safe_height,
            'text_regions': []
        }

        if text_config:
            # Reserve space for text
            text_height = specs.safe_height * text_config.font_size_ratio * 2

            if text_config.position in ('top', 'both'):
                layout['text_regions'].append({
                    'position': 'top',
                    'x': specs.bleed_inches,
                    'y': specs.bleed_inches,
                    'width': specs.safe_width,
                    'height': text_height,
                })
                layout['map_y'] += text_height + specs.bleed_inches
                layout['map_height'] -= text_height + specs.bleed_inches

            if text_config.position in ('bottom', 'both'):
                layout['text_regions'].append({
                    'position': 'bottom',
                    'x': specs.bleed_inches,
                    'y': specs.total_height - specs.bleed_inches - text_height,
                    'width': specs.safe_width,
                    'height': text_height,
                })
                layout['map_height'] -= text_height + specs.bleed_inches

        return layout

    def compose(self, config: CompositionConfig) -> ComposedArtwork:
        """
        Compose complete glass artwork.

        Returns artwork in both PNG and SVG formats.
        """
        specs = GLASS_SPECS[config.glass_size]
        layout = self._calculate_layout(specs, config.text)

        # Generate map
        map_config = MapConfig(
            lat=config.lat,
            lng=config.lng,
            radius_meters=config.map_radius,
            width_inches=layout['map_width'],
            height_inches=layout['map_height'],
            dpi=config.dpi,
            invert=config.invert,
            show_buildings=config.show_buildings,
            show_water=config.show_water,
            show_parks=False,
            heart_size=config.heart_size,
        )

        map_fig = self.map_generator.generate(map_config, add_heart=config.show_heart)

        # Create final composition figure
        fig, ax = plt.subplots(
            figsize=(layout['total_width'], layout['total_height']),
            dpi=config.dpi
        )

        # Set colors
        bg_color = 'black' if config.invert else 'white'
        fg_color = 'white' if config.invert else 'black'

        ax.set_facecolor(bg_color)
        fig.patch.set_facecolor(bg_color)

        # Convert map figure to image and embed
        map_buffer = io.BytesIO()
        map_fig.savefig(
            map_buffer,
            format='png',
            dpi=config.dpi,
            bbox_inches='tight',
            pad_inches=0,
            facecolor=bg_color,
            edgecolor='none'
        )
        map_buffer.seek(0)
        map_img = Image.open(map_buffer)
        plt.close(map_fig)

        # Calculate position in axes coordinates (0-1)
        map_left = layout['map_x'] / layout['total_width']
        map_bottom = layout['map_y'] / layout['total_height']
        map_w = layout['map_width'] / layout['total_width']
        map_h = layout['map_height'] / layout['total_height']

        # Add map image to composition
        ax_map = fig.add_axes([map_left, map_bottom, map_w, map_h])
        ax_map.imshow(map_img)
        ax_map.set_axis_off()

        # Add text
        if config.text:
            text_content = config.text.content
            if config.text.uppercase:
                text_content = text_content.upper()

            for region in layout['text_regions']:
                # Calculate text position
                text_x = (region['x'] + region['width'] / 2) / layout['total_width']
                text_y = (region['y'] + region['height'] / 2) / layout['total_height']

                font_size = layout['total_height'] * config.text.font_size_ratio * 72  # points

                fig.text(
                    text_x,
                    text_y,
                    text_content,
                    ha='center',
                    va='center',
                    fontsize=font_size,
                    fontfamily=config.text.font_family,
                    color=fg_color,
                    weight='normal',
                    transform=fig.transFigure
                )

        # Remove main axes
        ax.set_axis_off()

        # Export PNG
        png_buffer = io.BytesIO()
        fig.savefig(
            png_buffer,
            format='png',
            dpi=config.dpi,
            bbox_inches='tight',
            pad_inches=0,
            facecolor=bg_color,
            edgecolor='none'
        )
        png_buffer.seek(0)
        png_bytes = png_buffer.getvalue()

        # Export SVG
        svg_buffer = io.BytesIO()
        fig.savefig(
            svg_buffer,
            format='svg',
            bbox_inches='tight',
            pad_inches=0,
            facecolor=bg_color,
            edgecolor='none'
        )
        svg_buffer.seek(0)
        svg_string = svg_buffer.getvalue().decode('utf-8')

        # Calculate final dimensions
        width_px = int(layout['total_width'] * config.dpi)
        height_px = int(layout['total_height'] * config.dpi)

        plt.close(fig)

        return ComposedArtwork(
            png_bytes=png_bytes,
            svg_string=svg_string,
            width_px=width_px,
            height_px=height_px,
            width_inches=layout['total_width'],
            height_inches=layout['total_height'],
            config=config
        )

    def compose_from_address(
        self,
        address: str,
        custom_text: Optional[str] = None,
        glass_size: GlassSize = GlassSize.CAN_16OZ,
        **kwargs
    ) -> ComposedArtwork:
        """
        Compose artwork from a street address.

        Convenience method that handles geocoding.
        """
        # Geocode address
        result = self.map_generator.geocode(address)

        # Build text config
        text_config = None
        if custom_text:
            text_config = TextConfig(
                content=custom_text,
                position=kwargs.pop('text_position', 'bottom'),
                uppercase=kwargs.pop('uppercase', True),
            )

        # Build composition config
        config = CompositionConfig(
            lat=result.lat,
            lng=result.lng,
            address=result.formatted_address,
            glass_size=glass_size,
            text=text_config,
            **kwargs
        )

        return self.compose(config)


def create_glass_artwork(
    address: str,
    custom_text: Optional[str] = None,
    glass_size: str = "16oz",
    output_dir: Optional[str] = None,
    invert: bool = False,
    dpi: int = 300
) -> Tuple[str, str]:
    """
    Main entry point for creating glass etching artwork.

    Args:
        address: Full street address
        custom_text: Optional text to add (e.g., "Our First Home")
        glass_size: "16oz", "20oz", or "pint"
        output_dir: Directory to save files (optional)
        invert: If True, white on black
        dpi: Output resolution

    Returns:
        Tuple of (png_path, svg_path) if output_dir provided,
        otherwise (png_bytes, svg_string)
    """
    # Map glass size string to enum
    size_map = {
        "16oz": GlassSize.CAN_16OZ,
        "20oz": GlassSize.CAN_20OZ,
        "pint": GlassSize.PINT,
    }
    glass = size_map.get(glass_size, GlassSize.CAN_16OZ)

    composer = GlassComposer()
    artwork = composer.compose_from_address(
        address=address,
        custom_text=custom_text,
        glass_size=glass,
        invert=invert,
        dpi=dpi
    )

    if output_dir:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # Generate filename from address
        import hashlib
        addr_hash = hashlib.md5(address.encode()).hexdigest()[:8]
        base_name = f"glass_etch_{addr_hash}"

        png_path = output_path / f"{base_name}.png"
        svg_path = output_path / f"{base_name}.svg"

        with open(png_path, 'wb') as f:
            f.write(artwork.png_bytes)

        with open(svg_path, 'w') as f:
            f.write(artwork.svg_string)

        return str(png_path), str(svg_path)

    return artwork.png_bytes, artwork.svg_string
