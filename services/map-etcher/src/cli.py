#!/usr/bin/env python3
"""
Map Etcher CLI

Command-line tool for generating beer can glass etching artwork.

Usage:
    python cli.py generate --address "123 Main St, City, State" --text "Our First Home"
    python cli.py generate --lat 40.7128 --lng -74.0060 --text "NYC"
    python cli.py preview --address "123 Main St, City, State"
"""

import os
import sys
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from map_generator import MapGenerator, MapConfig, GeocodingResult
from glass_composer import (
    GlassComposer,
    CompositionConfig,
    TextConfig,
    GlassSize,
    GLASS_SPECS,
    create_glass_artwork
)

console = Console()


@click.group()
@click.version_option(version='1.0.0')
def cli():
    """Map Etcher - Generate beer can glass etching artwork from addresses."""
    pass


@cli.command()
@click.option('--address', '-a', help='Full street address')
@click.option('--lat', type=float, help='Latitude (if not using address)')
@click.option('--lng', type=float, help='Longitude (if not using address)')
@click.option('--text', '-t', help='Custom text to add to the glass')
@click.option('--text-position', type=click.Choice(['top', 'bottom', 'both']),
              default='bottom', help='Position of text')
@click.option('--glass-size', '-g', type=click.Choice(['16oz', '20oz', 'pint']),
              default='16oz', help='Glass size')
@click.option('--output', '-o', type=click.Path(), default='./output',
              help='Output directory')
@click.option('--radius', '-r', type=int, default=400,
              help='Map radius in meters')
@click.option('--dpi', type=int, default=300, help='Output resolution')
@click.option('--invert/--no-invert', default=False,
              help='Invert colors (white on black)')
@click.option('--no-buildings', is_flag=True, help='Hide buildings')
@click.option('--no-water', is_flag=True, help='Hide water features')
@click.option('--no-heart', is_flag=True, help='Hide heart marker')
def generate(address, lat, lng, text, text_position, glass_size, output,
             radius, dpi, invert, no_buildings, no_water, no_heart):
    """Generate glass etching artwork."""

    # Validate input
    if not address and (lat is None or lng is None):
        console.print("[red]Error:[/red] Must provide either --address or both --lat and --lng")
        sys.exit(1)

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:

        # Geocode if needed
        if address:
            task = progress.add_task("Geocoding address...", total=None)
            generator = MapGenerator()
            try:
                geo_result = generator.geocode(address)
                lat = geo_result.lat
                lng = geo_result.lng
                progress.update(task, description=f"[green]Found:[/green] {geo_result.formatted_address[:50]}...")
            except Exception as e:
                console.print(f"[red]Geocoding failed:[/red] {e}")
                sys.exit(1)

        # Map glass size
        size_map = {
            "16oz": GlassSize.CAN_16OZ,
            "20oz": GlassSize.CAN_20OZ,
            "pint": GlassSize.PINT,
        }
        glass = size_map[glass_size]
        specs = GLASS_SPECS[glass]

        # Build text config
        text_config = None
        if text:
            text_config = TextConfig(
                content=text,
                position=text_position,
                uppercase=True
            )

        # Build composition config
        config = CompositionConfig(
            lat=lat,
            lng=lng,
            address=address,
            glass_size=glass,
            map_radius=radius,
            show_buildings=not no_buildings,
            show_water=not no_water,
            show_heart=not no_heart,
            text=text_config,
            dpi=dpi,
            invert=invert,
        )

        # Generate artwork
        task = progress.add_task("Fetching map data...", total=None)
        composer = GlassComposer()

        progress.update(task, description="Rendering map...")
        artwork = composer.compose(config)

        progress.update(task, description="Saving files...")

        # Save outputs
        output_path = Path(output)
        output_path.mkdir(parents=True, exist_ok=True)

        # Generate filename
        import hashlib
        if address:
            name_base = hashlib.md5(address.encode()).hexdigest()[:8]
        else:
            name_base = f"{lat:.4f}_{lng:.4f}".replace('.', '_').replace('-', 'n')

        png_path = output_path / f"glass_etch_{name_base}.png"
        svg_path = output_path / f"glass_etch_{name_base}.svg"

        with open(png_path, 'wb') as f:
            f.write(artwork.png_bytes)

        with open(svg_path, 'w') as f:
            f.write(artwork.svg_string)

        progress.update(task, description="[green]Complete!")

    # Show results
    console.print()
    console.print(Panel.fit(
        f"[bold green]Artwork Generated Successfully![/bold green]\n\n"
        f"[bold]Location:[/bold] {lat:.6f}, {lng:.6f}\n"
        f"[bold]Glass:[/bold] {glass_size} ({specs.circumference_inches}\" x {specs.etch_height_inches}\")\n"
        f"[bold]Resolution:[/bold] {artwork.width_px} x {artwork.height_px} px @ {dpi} DPI\n"
        f"[bold]Text:[/bold] {text or '(none)'}\n\n"
        f"[bold]Files:[/bold]\n"
        f"  PNG: {png_path}\n"
        f"  SVG: {svg_path}",
        title="Result"
    ))


@cli.command()
@click.option('--address', '-a', required=True, help='Address to preview')
def preview(address):
    """Preview geocoding result without generating artwork."""

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:
        task = progress.add_task("Geocoding address...", total=None)

        generator = MapGenerator()
        try:
            result = generator.geocode(address)
        except Exception as e:
            console.print(f"[red]Geocoding failed:[/red] {e}")
            sys.exit(1)

    console.print()
    table = Table(title="Geocoding Result")
    table.add_column("Field", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Input", address)
    table.add_row("Formatted Address", result.formatted_address)
    table.add_row("Latitude", f"{result.lat:.8f}")
    table.add_row("Longitude", f"{result.lng:.8f}")
    table.add_row("Confidence", result.confidence)
    table.add_row("Google Maps", f"https://maps.google.com/?q={result.lat},{result.lng}")

    console.print(table)


@cli.command()
def specs():
    """Show glass specifications."""

    console.print()
    table = Table(title="Glass Specifications")
    table.add_column("Size", style="cyan")
    table.add_column("Circumference", style="green")
    table.add_column("Etch Height", style="green")
    table.add_column("Bleed", style="yellow")
    table.add_column("Safe Area", style="magenta")

    for size, spec in GLASS_SPECS.items():
        table.add_row(
            size.value,
            f'{spec.circumference_inches}"',
            f'{spec.etch_height_inches}"',
            f'{spec.bleed_inches}"',
            f'{spec.safe_width:.2f}" x {spec.safe_height:.2f}"'
        )

    console.print(table)

    console.print()
    console.print(Panel.fit(
        "[bold]Print Specifications for Laser Etching:[/bold]\n\n"
        "Format: PNG (raster) and SVG (vector)\n"
        "Color: Black and white (black = etch area)\n"
        "Resolution: 300 DPI recommended\n"
        "Bleed: 0.125\" on all sides\n\n"
        "[bold]Note:[/bold] SVG format is preferred for laser etching\n"
        "as it provides clean vector paths.",
        title="Output Format"
    ))


@cli.command()
@click.argument('addresses', nargs=-1)
@click.option('--text', '-t', help='Text to add (same for all)')
@click.option('--glass-size', '-g', type=click.Choice(['16oz', '20oz', 'pint']),
              default='16oz')
@click.option('--output', '-o', type=click.Path(), default='./output')
def batch(addresses, text, glass_size, output):
    """Generate artwork for multiple addresses."""

    if not addresses:
        console.print("[red]Error:[/red] No addresses provided")
        sys.exit(1)

    console.print(f"Processing {len(addresses)} addresses...")
    console.print()

    results = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:

        for i, address in enumerate(addresses, 1):
            task = progress.add_task(
                f"[{i}/{len(addresses)}] {address[:40]}...",
                total=None
            )

            try:
                png_path, svg_path = create_glass_artwork(
                    address=address,
                    custom_text=text,
                    glass_size=glass_size,
                    output_dir=output
                )
                results.append({
                    'address': address,
                    'status': 'success',
                    'png': png_path,
                    'svg': svg_path
                })
                progress.update(task, description=f"[green]{address[:40]}... Done")
            except Exception as e:
                results.append({
                    'address': address,
                    'status': 'failed',
                    'error': str(e)
                })
                progress.update(task, description=f"[red]{address[:40]}... Failed")

    # Summary
    console.print()
    table = Table(title="Batch Results")
    table.add_column("Address", style="cyan", max_width=40)
    table.add_column("Status", style="green")
    table.add_column("Output", style="dim")

    success = 0
    for r in results:
        if r['status'] == 'success':
            success += 1
            table.add_row(
                r['address'][:40],
                "[green]Success",
                Path(r['png']).name
            )
        else:
            table.add_row(
                r['address'][:40],
                "[red]Failed",
                r.get('error', 'Unknown error')[:30]
            )

    console.print(table)
    console.print()
    console.print(f"[bold]Completed:[/bold] {success}/{len(addresses)} successful")


if __name__ == '__main__':
    cli()
