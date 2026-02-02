/**
 * Map Etcher Service Client
 *
 * Node.js client for the Python map-etcher service.
 * Generates laser-etching artwork for beer can glasses.
 */

export interface GeocodingResult {
  lat: number;
  lng: number;
  formatted_address: string;
  confidence: "exact" | "interpolated" | "approximate";
}

export interface GenerateRequest {
  // Location (provide address OR lat/lng)
  address?: string;
  lat?: number;
  lng?: number;

  // Customization
  text?: string;
  text_position?: "top" | "bottom" | "both";
  uppercase?: boolean;

  // Glass options
  glass_size?: "16oz" | "20oz" | "pint";

  // Map options
  radius?: number; // meters, default 400
  show_buildings?: boolean;
  show_water?: boolean;
  show_heart?: boolean;
  invert?: boolean;

  // Output
  dpi?: number; // default 300
}

export interface GenerateResult {
  order_id: string;
  png_url: string;
  svg_url: string;
  width_px: number;
  height_px: number;
  width_inches: number;
  height_inches: number;
  lat: number;
  lng: number;
}

export interface PreviewResult {
  preview: string; // data:image/png;base64,...
  width_px: number;
  height_px: number;
}

export interface GlassSpec {
  circumference_inches: number;
  etch_height_inches: number;
  bleed_inches: number;
  safe_width_inches: number;
  safe_height_inches: number;
}

export type GlassSpecs = Record<string, GlassSpec>;

// Default service URL (can be overridden via environment)
const MAP_ETCHER_URL =
  process.env.MAP_ETCHER_URL || "http://localhost:5000";

/**
 * Map Etcher client class
 */
export class MapEtcherClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = MAP_ETCHER_URL, timeout: number = 60000) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = timeout;
  }

  /**
   * Check if the service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Geocode an address to coordinates
   */
  async geocode(address: string): Promise<GeocodingResult> {
    const response = await fetch(`${this.baseUrl}/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Geocoding failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Generate glass etching artwork
   */
  async generate(request: GenerateRequest): Promise<GenerateResult> {
    // Validate input
    if (!request.address && (request.lat == null || request.lng == null)) {
      throw new Error("Must provide either address or lat/lng");
    }

    const response = await fetch(`${this.baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Generation failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Generate a low-resolution preview (returns base64 image)
   */
  async preview(request: GenerateRequest): Promise<PreviewResult> {
    const response = await fetch(`${this.baseUrl}/generate/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000), // Shorter timeout for preview
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Preview failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Download a generated file as a buffer
   */
  async downloadFile(fileUrl: string): Promise<Buffer> {
    // Handle relative URLs
    const url = fileUrl.startsWith("http")
      ? fileUrl
      : `${this.baseUrl}${fileUrl}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Get glass specifications
   */
  async getSpecs(): Promise<GlassSpecs> {
    const response = await fetch(`${this.baseUrl}/specs`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Failed to get specs: ${response.status}`);
    }

    return response.json();
  }
}

// Default client instance
const defaultClient = new MapEtcherClient();

/**
 * Generate glass etching artwork from an order
 *
 * @example
 * ```ts
 * const result = await generateGlassArtwork({
 *   address: "123 Main St, City, State 12345",
 *   text: "Our First Home",
 *   glass_size: "16oz"
 * });
 *
 * // Upload files to storage
 * const pngBuffer = await downloadArtworkFile(result.png_url);
 * await uploadToR2(pngBuffer, `orders/${orderId}/print.png`);
 * ```
 */
export async function generateGlassArtwork(
  request: GenerateRequest
): Promise<GenerateResult> {
  return defaultClient.generate(request);
}

/**
 * Generate a preview image (base64)
 */
export async function generatePreview(
  request: GenerateRequest
): Promise<PreviewResult> {
  return defaultClient.preview(request);
}

/**
 * Download an artwork file as a buffer
 */
export async function downloadArtworkFile(fileUrl: string): Promise<Buffer> {
  return defaultClient.downloadFile(fileUrl);
}

/**
 * Geocode an address
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult> {
  return defaultClient.geocode(address);
}

/**
 * Check if the map etcher service is available
 */
export async function isMapEtcherAvailable(): Promise<boolean> {
  return defaultClient.healthCheck();
}

/**
 * Get glass specifications
 */
export async function getGlassSpecs(): Promise<GlassSpecs> {
  return defaultClient.getSpecs();
}

// Re-export the client class for custom configurations
export { defaultClient as mapEtcherClient };
