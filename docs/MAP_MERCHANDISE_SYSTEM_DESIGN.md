# Map Memory Merchandise - Technical System Design

## Executive Summary

This document describes a fully automated system that transforms customer location data into print-ready personalized merchandise. The system requires zero manual design or order handling, operating as a complete end-to-end pipeline from Etsy order placement to customer doorstep delivery.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Component Specifications](#2-component-specifications)
3. [External Services & APIs](#3-external-services--apis)
4. [Data Flow](#4-data-flow)
5. [Map Generation Pipeline](#5-map-generation-pipeline)
6. [Artwork Composition Engine](#6-artwork-composition-engine)
7. [Order Processing Automation](#7-order-processing-automation)
8. [File Format & Rendering Requirements](#8-file-format--rendering-requirements)
9. [Database Schema](#9-database-schema)
10. [Error Handling & Recovery](#10-error-handling--recovery)
11. [Scalability Architecture](#11-scalability-architecture)
12. [Security Considerations](#12-security-considerations)
13. [Monitoring & Observability](#13-monitoring--observability)
14. [Cost Analysis](#14-cost-analysis)

---

## 1. System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CUSTOMER JOURNEY                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ETSY STOREFRONT                                   │
│  • Customizable listing with personalization fields                         │
│  • Address input, custom text, product selection                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Webhook (Order Created)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ORDER INGESTION SERVICE                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │
│  │   Webhook   │───▶│   Parser    │───▶│  Validator  │                      │
│  │  Receiver   │    │             │    │             │                      │
│  └─────────────┘    └─────────────┘    └─────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           JOB QUEUE (Redis/BullMQ)                           │
│  • Order processing jobs                                                     │
│  • Retry logic with exponential backoff                                     │
│  • Dead letter queue for failed jobs                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARTWORK GENERATION PIPELINE                          │
│                                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │   Geocoder   │──▶│ Map Generator│──▶│  Compositor  │──▶│   Renderer   │ │
│  │   Service    │   │   Service    │   │   Service    │   │   Service    │ │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘ │
│         │                  │                  │                  │          │
│         ▼                  ▼                  ▼                  ▼          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      ASSET STORAGE (S3/Cloudflare R2)                │  │
│  │  • Raw map SVGs  • Composed artwork  • Print-ready files             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PRINT-ON-DEMAND INTEGRATION                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │
│  │  Printful   │    │  Printify   │    │  Gooten     │                      │
│  │    API      │    │    API      │    │    API      │                      │
│  └─────────────┘    └─────────────┘    └─────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Fulfillment webhooks
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STATUS SYNC SERVICE                                  │
│  • Update Etsy order status                                                 │
│  • Send tracking information                                                │
│  • Customer notification triggers                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Runtime** | Node.js 20 LTS | Existing stack compatibility, async I/O |
| **Framework** | Remix | Already in use, server-side rendering |
| **Database** | Supabase (PostgreSQL) | Existing infrastructure, real-time capabilities |
| **Queue** | BullMQ + Redis | Reliable job processing, retries, scheduling |
| **Object Storage** | Cloudflare R2 or AWS S3 | Cost-effective, CDN integration |
| **Map Generation** | prettymaps (Python) or mapbox-gl | Stylized map rendering |
| **Image Processing** | Sharp + librsvg | High-performance image manipulation |
| **PDF Generation** | PDFKit or Puppeteer | Print-ready file creation |
| **Hosting** | Netlify Functions + Railway | Serverless + persistent workers |

---

## 2. Component Specifications

### 2.1 Order Ingestion Service

**Responsibility:** Receive and validate incoming orders from Etsy.

```typescript
interface EtsyOrder {
  receipt_id: number;
  buyer_email: string;
  buyer_user_id: number;
  transactions: EtsyTransaction[];
  shipping_address: EtsyShippingAddress;
  created_timestamp: number;
}

interface EtsyTransaction {
  transaction_id: number;
  listing_id: number;
  quantity: number;
  variations: EtsyVariation[];
  personalization: {
    personalized_text: string;  // Contains address + custom phrase
  };
}

interface ParsedCustomization {
  street_address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  custom_phrase: string | null;
  product_type: ProductType;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

type ProductType =
  | 'mug_11oz'
  | 'mug_15oz'
  | 'tshirt_unisex'
  | 'tshirt_fitted'
  | 'beer_glass_pint'
  | 'beer_glass_can'
  | 'poster_8x10'
  | 'poster_11x14'
  | 'poster_16x20';
```

**Parsing Strategy:**

Etsy personalization fields are free-form text. Structure input with clear delimiters:

```
Address: 123 Main Street, Brooklyn, NY 11201, USA
Text: Where Our Story Began
```

Parsing regex:
```typescript
const ADDRESS_PATTERN = /Address:\s*(.+?)(?:\n|$)/i;
const TEXT_PATTERN = /Text:\s*(.+?)(?:\n|$)/i;
```

### 2.2 Geocoding Service

**Responsibility:** Convert street addresses to precise coordinates.

**Primary Provider:** Google Maps Geocoding API
**Fallback Provider:** OpenStreetMap Nominatim

```typescript
interface GeocodingResult {
  lat: number;
  lng: number;
  formatted_address: string;
  confidence: 'rooftop' | 'range_interpolated' | 'geometric_center' | 'approximate';
  place_id: string;
}

interface GeocodingService {
  geocode(address: string): Promise<GeocodingResult>;
  reverseGeocode(lat: number, lng: number): Promise<GeocodingResult>;
}
```

**Geocoding Rules:**
1. Only accept `rooftop` or `range_interpolated` confidence for heart placement
2. Cache results by address hash (addresses rarely change)
3. Fallback to Nominatim if Google fails (rate limits, outages)
4. Store original input + resolved coordinates for audit

### 2.3 Map Generation Service

**Responsibility:** Generate stylized map artwork for a given location.

**Recommended Engine:** [prettymaps](https://github.com/marceloprates/prettymaps) (Python)

This library generates aesthetically pleasing maps using OpenStreetMap data with customizable styles.

```python
# Example prettymaps configuration
from prettymaps import plot

fig, ax = plot(
    (40.7128, -74.0060),  # Coordinates
    radius=500,           # Meters from center
    layers={
        'perimeter': {},
        'streets': {
            'width': {
                'motorway': 5,
                'trunk': 5,
                'primary': 4.5,
                'secondary': 4,
                'tertiary': 3.5,
                'residential': 3,
            }
        },
        'building': {'tags': {'building': True}},
        'water': {'tags': {'natural': ['water', 'bay']}},
        'green': {'tags': {'landuse': 'grass', 'natural': ['island', 'wood']}},
    },
    style={
        'background': {'fc': '#F2F4CB', 'ec': '#dadbc1'},
        'perimeter': {'fc': '#F2F4CB', 'ec': '#dadbc1'},
        'streets': {'fc': '#2F3737', 'ec': '#475657'},
        'building': {'palette': ['#FFC857', '#E9724C', '#C5283D']},
        'water': {'fc': '#a1e3ff', 'ec': '#2F3737'},
        'green': {'fc': '#D0F1BF', 'ec': '#2F3737'},
    },
    figsize=(12, 12),
)
```

**Alternative: Custom Mapbox GL Renderer**

For higher control and consistency, use Mapbox GL JS with a custom style:

```typescript
interface MapGenerationConfig {
  center: [number, number];  // [lng, lat]
  zoom: number;
  width: number;   // pixels
  height: number;  // pixels
  style: MapStyle;
  format: 'svg' | 'png';
  dpi: number;     // 300 for print
}

interface MapStyle {
  name: string;
  backgroundColor: string;
  roadColor: string;
  buildingColor: string;
  waterColor: string;
  greenColor: string;
  roadWidths: Record<string, number>;
}
```

**Map Generation Worker (Python microservice):**

```python
# map_generator/service.py
from flask import Flask, request, send_file
import prettymaps
import io

app = Flask(__name__)

@app.route('/generate', methods=['POST'])
def generate_map():
    data = request.json
    lat = data['lat']
    lng = data['lng']
    style_name = data.get('style', 'default')
    output_format = data.get('format', 'svg')

    # Load style configuration
    style = STYLES[style_name]

    # Generate map
    fig, ax = prettymaps.plot(
        (lat, lng),
        radius=data.get('radius', 400),
        layers=style['layers'],
        style=style['style'],
        figsize=(12, 12),
    )

    # Export
    buffer = io.BytesIO()
    if output_format == 'svg':
        fig.savefig(buffer, format='svg', bbox_inches='tight', pad_inches=0)
    else:
        fig.savefig(buffer, format='png', dpi=300, bbox_inches='tight', pad_inches=0)

    buffer.seek(0)
    return send_file(buffer, mimetype=f'image/{output_format}')
```

### 2.4 Artwork Composition Engine

**Responsibility:** Combine map, heart marker, and text into final design.

```typescript
interface CompositionSpec {
  orderId: string;
  productType: ProductType;
  mapAsset: {
    url: string;
    width: number;
    height: number;
  };
  heartPosition: {
    x: number;  // percentage from left
    y: number;  // percentage from top
  };
  customText: string | null;
  textStyle: {
    fontFamily: string;
    fontSize: number;
    color: string;
    position: 'above' | 'below' | 'none';
  };
}

interface ComposedArtwork {
  printArea: {
    width: number;
    height: number;
    dpi: number;
  };
  layers: Layer[];
  exportFormats: ('png' | 'pdf' | 'svg')[];
}

interface Layer {
  type: 'image' | 'svg' | 'text';
  content: string;  // URL or text content
  bounds: { x: number; y: number; width: number; height: number };
  opacity: number;
}
```

**Product Print Specifications:**

```typescript
const PRODUCT_SPECS: Record<ProductType, PrintSpec> = {
  mug_11oz: {
    printArea: { width: 2700, height: 1100 },  // pixels at 300 DPI
    dpi: 300,
    bleed: 36,  // 0.12 inches
    safeZone: 75,  // 0.25 inches from edge
    format: 'png',
    colorSpace: 'sRGB',
  },
  mug_15oz: {
    printArea: { width: 2850, height: 1200 },
    dpi: 300,
    bleed: 36,
    safeZone: 75,
    format: 'png',
    colorSpace: 'sRGB',
  },
  tshirt_unisex: {
    printArea: { width: 4500, height: 5400 },  // 15" x 18" at 300 DPI
    dpi: 300,
    bleed: 0,
    safeZone: 150,
    format: 'png',
    colorSpace: 'sRGB',
    transparentBackground: true,
  },
  beer_glass_can: {
    printArea: { width: 2400, height: 1800 },
    dpi: 300,
    bleed: 36,
    safeZone: 75,
    format: 'png',
    colorSpace: 'sRGB',
  },
  poster_11x14: {
    printArea: { width: 3300, height: 4200 },
    dpi: 300,
    bleed: 75,  // 0.25 inches
    safeZone: 150,
    format: 'pdf',
    colorSpace: 'sRGB',  // CMYK for professional print
  },
};
```

**Composition Algorithm:**

```typescript
async function composeArtwork(spec: CompositionSpec): Promise<Buffer> {
  const productSpec = PRODUCT_SPECS[spec.productType];

  // 1. Create canvas at print dimensions
  const canvas = createCanvas(
    productSpec.printArea.width + (productSpec.bleed * 2),
    productSpec.printArea.height + (productSpec.bleed * 2)
  );

  // 2. Load and scale map to fit print area
  const mapImage = await loadImage(spec.mapAsset.url);
  const scaledMap = scaleToFit(mapImage, {
    width: productSpec.printArea.width - (productSpec.safeZone * 2),
    height: calculateMapHeight(productSpec, spec.customText),
  });

  // 3. Center map in print area
  const mapX = (canvas.width - scaledMap.width) / 2;
  const mapY = productSpec.bleed + productSpec.safeZone;
  drawImage(canvas, scaledMap, mapX, mapY);

  // 4. Calculate heart position on scaled map
  const heartX = mapX + (scaledMap.width * spec.heartPosition.x);
  const heartY = mapY + (scaledMap.height * spec.heartPosition.y);
  drawHeartMarker(canvas, heartX, heartY, HEART_SIZE);

  // 5. Add custom text if present
  if (spec.customText && spec.textStyle.position !== 'none') {
    const textY = spec.textStyle.position === 'below'
      ? mapY + scaledMap.height + TEXT_MARGIN
      : mapY - TEXT_MARGIN;

    drawText(canvas, spec.customText, {
      x: canvas.width / 2,
      y: textY,
      font: spec.textStyle.fontFamily,
      size: spec.textStyle.fontSize,
      color: spec.textStyle.color,
      align: 'center',
    });
  }

  // 6. Export in required format
  return exportCanvas(canvas, productSpec.format, productSpec.colorSpace);
}
```

**Heart Marker SVG:**

```svg
<svg viewBox="0 0 24 24" width="48" height="48">
  <path
    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
    fill="#E74C3C"
    stroke="#FFFFFF"
    stroke-width="1"
  />
</svg>
```

---

## 3. External Services & APIs

### 3.1 Required API Integrations

| Service | Purpose | Authentication | Rate Limits |
|---------|---------|----------------|-------------|
| **Etsy Open API v3** | Order webhooks, listing management | OAuth 2.0 | 10,000/day |
| **Google Geocoding API** | Address to coordinates | API Key | 50/second |
| **OpenStreetMap Nominatim** | Fallback geocoding | None (respectful use) | 1/second |
| **Printful API** | Print-on-demand fulfillment | API Key | 120/minute |
| **Printify API** | Alternative fulfillment | API Key | 600/minute |
| **Cloudflare R2** | Asset storage | Access Key | Unlimited |

### 3.2 Etsy API Integration

**Webhook Setup:**

```typescript
// Etsy webhook events to subscribe
const ETSY_WEBHOOK_EVENTS = [
  'receipt.created',      // New order placed
  'receipt.updated',      // Order status change
  'receipt.shipped',      // Fulfillment completed (from our side)
];

// Webhook payload structure
interface EtsyWebhookPayload {
  event_type: string;
  timestamp: number;
  shop_id: number;
  data: {
    receipt_id: number;
    // ... order details
  };
  signature: string;  // HMAC-SHA256 verification
}
```

**Webhook Verification:**

```typescript
function verifyEtsyWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### 3.3 Print-on-Demand Provider Integration

**Printful Order Creation:**

```typescript
interface PrintfulOrderRequest {
  external_id: string;  // Our order ID
  shipping: 'STANDARD' | 'EXPRESS';
  recipient: {
    name: string;
    address1: string;
    city: string;
    state_code: string;
    country_code: string;
    zip: string;
  };
  items: PrintfulItem[];
}

interface PrintfulItem {
  sync_variant_id?: number;  // If using synced products
  external_variant_id?: string;
  quantity: number;
  files: PrintfulFile[];
}

interface PrintfulFile {
  type: 'default' | 'back' | 'preview';
  url: string;  // Public URL to print file
  filename: string;
}

// Submit order to Printful
async function submitToPrintful(order: ProcessedOrder): Promise<string> {
  const printfulOrder: PrintfulOrderRequest = {
    external_id: order.id,
    shipping: 'STANDARD',
    recipient: mapShippingAddress(order.shippingAddress),
    items: [{
      external_variant_id: PRODUCT_VARIANT_MAP[order.productType],
      quantity: order.quantity,
      files: [{
        type: 'default',
        url: order.printFileUrl,
        filename: `${order.id}_print.png`,
      }],
    }],
  };

  const response = await fetch('https://api.printful.com/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PRINTFUL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(printfulOrder),
  });

  const result = await response.json();
  return result.result.id;
}
```

---

## 4. Data Flow

### 4.1 Complete Order Flow Sequence

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Etsy   │     │ Webhook │     │  Queue  │     │ Worker  │     │ Storage │
│  Order  │     │ Handler │     │ (Redis) │     │ Process │     │  (R2)   │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │  Order Event  │               │               │               │
     │──────────────▶│               │               │               │
     │               │               │               │               │
     │               │ Validate &    │               │               │
     │               │ Parse         │               │               │
     │               │──────────────▶│               │               │
     │               │               │ Enqueue Job   │               │
     │               │               │──────────────▶│               │
     │               │               │               │               │
     │               │               │               │ 1. Geocode    │
     │               │               │               │───────────────│
     │               │               │               │               │
     │               │               │               │ 2. Generate   │
     │               │               │               │    Map        │
     │               │               │               │──────────────▶│
     │               │               │               │               │
     │               │               │               │ 3. Compose    │
     │               │               │               │    Artwork    │
     │               │               │               │──────────────▶│
     │               │               │               │               │
     │               │               │               │ 4. Upload     │
     │               │               │               │    Print File │
     │               │               │               │──────────────▶│
     │               │               │               │               │
┌────┴────┐     ┌────┴────┐     ┌────┴────┐     ┌────┴────┐     ┌────┴────┐
│Printful │     │  Etsy   │     │ Notif.  │     │Database │     │ Storage │
│   API   │     │   API   │     │ Service │     │(Supbase)│     │  (R2)   │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │◀──────────────│───────────────│───────────────│───────────────│
     │  Submit Order │               │               │               │
     │               │               │               │               │
     │  Fulfillment  │               │               │               │
     │  Webhook      │               │               │               │
     │──────────────▶│ Update Status │               │               │
     │               │──────────────▶│               │               │
     │               │               │ Send Tracking │               │
     │               │               │──────────────▶│               │
     │               │               │               │ Update Record │
     │               │               │               │──────────────▶│
```

### 4.2 State Machine

```typescript
enum OrderStatus {
  RECEIVED = 'received',           // Webhook received
  VALIDATING = 'validating',       // Parsing customization
  VALIDATION_FAILED = 'validation_failed',
  GEOCODING = 'geocoding',         // Converting address
  GEOCODING_FAILED = 'geocoding_failed',
  GENERATING_MAP = 'generating_map',
  MAP_GENERATION_FAILED = 'map_generation_failed',
  COMPOSING = 'composing',         // Building final artwork
  COMPOSITION_FAILED = 'composition_failed',
  UPLOADING = 'uploading',         // Storing print file
  UPLOAD_FAILED = 'upload_failed',
  SUBMITTING = 'submitting',       // Sending to POD
  SUBMISSION_FAILED = 'submission_failed',
  IN_PRODUCTION = 'in_production', // POD is printing
  SHIPPED = 'shipped',             // Package dispatched
  DELIVERED = 'delivered',         // Final state
  CANCELLED = 'cancelled',
  REFUND_REQUIRED = 'refund_required',
}

const STATE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.RECEIVED]: [OrderStatus.VALIDATING],
  [OrderStatus.VALIDATING]: [OrderStatus.GEOCODING, OrderStatus.VALIDATION_FAILED],
  [OrderStatus.GEOCODING]: [OrderStatus.GENERATING_MAP, OrderStatus.GEOCODING_FAILED],
  [OrderStatus.GENERATING_MAP]: [OrderStatus.COMPOSING, OrderStatus.MAP_GENERATION_FAILED],
  [OrderStatus.COMPOSING]: [OrderStatus.UPLOADING, OrderStatus.COMPOSITION_FAILED],
  [OrderStatus.UPLOADING]: [OrderStatus.SUBMITTING, OrderStatus.UPLOAD_FAILED],
  [OrderStatus.SUBMITTING]: [OrderStatus.IN_PRODUCTION, OrderStatus.SUBMISSION_FAILED],
  [OrderStatus.IN_PRODUCTION]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  // Failed states can retry
  [OrderStatus.VALIDATION_FAILED]: [OrderStatus.VALIDATING, OrderStatus.REFUND_REQUIRED],
  [OrderStatus.GEOCODING_FAILED]: [OrderStatus.GEOCODING, OrderStatus.REFUND_REQUIRED],
  // ... etc
};
```

---

## 5. Map Generation Pipeline

### 5.1 Map Style Presets

```typescript
const MAP_STYLES: Record<string, MapStyleConfig> = {
  classic: {
    name: 'Classic',
    background: '#FDFAF6',
    roads: {
      primary: { color: '#2C3E50', width: 4 },
      secondary: { color: '#34495E', width: 3 },
      residential: { color: '#5D6D7E', width: 2 },
    },
    buildings: { color: '#E8E4DF', stroke: '#D5D0C8' },
    water: { color: '#AED6F1', stroke: '#85C1E9' },
    green: { color: '#D5F5E3', stroke: '#ABEBC6' },
  },

  minimal: {
    name: 'Minimal',
    background: '#FFFFFF',
    roads: {
      primary: { color: '#1A1A1A', width: 3 },
      secondary: { color: '#4A4A4A', width: 2 },
      residential: { color: '#8A8A8A', width: 1 },
    },
    buildings: { color: '#F5F5F5', stroke: '#E0E0E0' },
    water: { color: '#E3F2FD', stroke: '#BBDEFB' },
    green: { color: '#F1F8E9', stroke: '#DCEDC8' },
  },

  vintage: {
    name: 'Vintage',
    background: '#F5E6D3',
    roads: {
      primary: { color: '#5D4037', width: 4 },
      secondary: { color: '#795548', width: 3 },
      residential: { color: '#A1887F', width: 2 },
    },
    buildings: { color: '#EFEBE9', stroke: '#D7CCC8' },
    water: { color: '#B3E5FC', stroke: '#81D4FA' },
    green: { color: '#C8E6C9', stroke: '#A5D6A7' },
  },

  night: {
    name: 'Night',
    background: '#1A1A2E',
    roads: {
      primary: { color: '#E94560', width: 4 },
      secondary: { color: '#F06595', width: 3 },
      residential: { color: '#4A4A6A', width: 2 },
    },
    buildings: { color: '#16213E', stroke: '#0F3460' },
    water: { color: '#0F3460', stroke: '#1A1A2E' },
    green: { color: '#1E3A2F', stroke: '#145A32' },
  },
};
```

### 5.2 Map Rendering Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MAP GENERATION SERVICE                        │
│                      (Python Worker)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Request    │───▶│    OSM       │───▶│   Style      │       │
│  │   Handler    │    │   Fetcher    │    │   Applier    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                             │                    │               │
│                             ▼                    ▼               │
│                      ┌──────────────┐    ┌──────────────┐       │
│                      │    Cache     │    │   Renderer   │       │
│                      │   (Redis)    │    │  (Matplotlib)│       │
│                      └──────────────┘    └──────────────┘       │
│                                                  │               │
│                                                  ▼               │
│                                          ┌──────────────┐       │
│                                          │   Exporter   │       │
│                                          │  (SVG/PNG)   │       │
│                                          └──────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 OSM Data Caching Strategy

To avoid redundant OpenStreetMap queries:

```typescript
interface MapTileCache {
  // Cache key format: "{zoom}_{lat_rounded}_{lng_rounded}"
  // Round to 3 decimal places (~111m precision at equator)
  getCacheKey(lat: number, lng: number, radius: number): string;

  // Store raw OSM GeoJSON
  store(key: string, data: GeoJSON, ttl: number): Promise<void>;

  // Retrieve cached data
  get(key: string): Promise<GeoJSON | null>;
}

// Cache TTL: 30 days (map data changes slowly)
const MAP_CACHE_TTL = 30 * 24 * 60 * 60;
```

### 5.4 Coordinate to Print Position Mapping

```typescript
function calculateHeartPosition(
  coordinates: { lat: number; lng: number },
  mapBounds: { north: number; south: number; east: number; west: number },
  canvasSize: { width: number; height: number }
): { x: number; y: number } {
  // Convert geographic coordinates to canvas position
  const xPercent = (coordinates.lng - mapBounds.west) / (mapBounds.east - mapBounds.west);
  const yPercent = (mapBounds.north - coordinates.lat) / (mapBounds.north - mapBounds.south);

  return {
    x: xPercent * canvasSize.width,
    y: yPercent * canvasSize.height,
  };
}
```

---

## 6. Artwork Composition Engine

### 6.1 Layout Templates

```typescript
interface LayoutTemplate {
  id: string;
  name: string;
  regions: {
    map: BoundingBox;
    heart: 'center' | 'at_coordinates';
    text: TextRegion | null;
    border: BorderConfig | null;
  };
}

interface BoundingBox {
  x: number;      // percentage from left
  y: number;      // percentage from top
  width: number;  // percentage of total width
  height: number; // percentage of total height
}

interface TextRegion {
  position: 'above' | 'below' | 'overlay';
  alignment: 'left' | 'center' | 'right';
  maxLines: number;
  bounds: BoundingBox;
}

const LAYOUTS: Record<string, LayoutTemplate> = {
  centered_text_below: {
    id: 'centered_text_below',
    name: 'Classic',
    regions: {
      map: { x: 0.05, y: 0.05, width: 0.9, height: 0.75 },
      heart: 'at_coordinates',
      text: {
        position: 'below',
        alignment: 'center',
        maxLines: 2,
        bounds: { x: 0.1, y: 0.82, width: 0.8, height: 0.15 },
      },
      border: null,
    },
  },

  map_only: {
    id: 'map_only',
    name: 'Map Only',
    regions: {
      map: { x: 0, y: 0, width: 1, height: 1 },
      heart: 'at_coordinates',
      text: null,
      border: null,
    },
  },

  framed: {
    id: 'framed',
    name: 'Framed',
    regions: {
      map: { x: 0.08, y: 0.08, width: 0.84, height: 0.7 },
      heart: 'at_coordinates',
      text: {
        position: 'below',
        alignment: 'center',
        maxLines: 2,
        bounds: { x: 0.1, y: 0.8, width: 0.8, height: 0.12 },
      },
      border: {
        width: 0.03,
        color: '#2C3E50',
        style: 'solid',
      },
    },
  },
};
```

### 6.2 Typography System

```typescript
const FONT_CONFIG = {
  primary: {
    family: 'Playfair Display',
    weights: [400, 700],
    fallback: 'Georgia, serif',
  },
  secondary: {
    family: 'Lato',
    weights: [300, 400, 700],
    fallback: 'Helvetica, Arial, sans-serif',
  },
};

interface TextStyle {
  fontFamily: string;
  fontSize: number;       // in points
  fontWeight: number;
  letterSpacing: number;  // em units
  lineHeight: number;     // multiplier
  color: string;
  textTransform: 'none' | 'uppercase' | 'lowercase';
}

const TEXT_STYLES: Record<string, TextStyle> = {
  title: {
    fontFamily: 'Playfair Display',
    fontSize: 48,
    fontWeight: 700,
    letterSpacing: 0.05,
    lineHeight: 1.2,
    color: '#2C3E50',
    textTransform: 'none',
  },
  subtitle: {
    fontFamily: 'Lato',
    fontSize: 24,
    fontWeight: 300,
    letterSpacing: 0.1,
    lineHeight: 1.4,
    color: '#5D6D7E',
    textTransform: 'uppercase',
  },
};
```

### 6.3 Rendering Pipeline

```typescript
import sharp from 'sharp';
import { createCanvas, loadImage, registerFont } from 'canvas';

async function renderArtwork(spec: RenderSpec): Promise<Buffer> {
  const { productSpec, mapSvg, heartPosition, customText, style } = spec;

  // 1. Register custom fonts
  registerFont('./fonts/PlayfairDisplay-Bold.ttf', { family: 'Playfair Display', weight: 'bold' });
  registerFont('./fonts/Lato-Light.ttf', { family: 'Lato', weight: '300' });

  // 2. Create high-resolution canvas
  const canvas = createCanvas(
    productSpec.width + productSpec.bleed * 2,
    productSpec.height + productSpec.bleed * 2
  );
  const ctx = canvas.getContext('2d');

  // 3. Fill background
  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 4. Convert SVG to PNG for compositing
  const mapPng = await sharp(Buffer.from(mapSvg))
    .resize(productSpec.mapWidth, productSpec.mapHeight, { fit: 'contain' })
    .png()
    .toBuffer();

  const mapImage = await loadImage(mapPng);

  // 5. Draw map
  const mapX = (canvas.width - mapImage.width) / 2;
  const mapY = productSpec.bleed + productSpec.safeZone;
  ctx.drawImage(mapImage, mapX, mapY);

  // 6. Draw heart marker
  const heartSvg = await loadImage(HEART_SVG_BUFFER);
  const heartSize = 48;
  ctx.drawImage(
    heartSvg,
    mapX + heartPosition.x - heartSize / 2,
    mapY + heartPosition.y - heartSize / 2,
    heartSize,
    heartSize
  );

  // 7. Draw custom text
  if (customText) {
    ctx.font = `bold ${style.fontSize}px "Playfair Display"`;
    ctx.fillStyle = style.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const textY = mapY + mapImage.height + 40;
    ctx.fillText(customText, canvas.width / 2, textY);
  }

  // 8. Export at print quality
  return canvas.toBuffer('image/png', {
    compressionLevel: 6,
    filters: canvas.PNG_FILTER_NONE,
  });
}
```

---

## 7. Order Processing Automation

### 7.1 Job Queue Configuration

```typescript
import { Queue, Worker, Job } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

// Order processing queue
const orderQueue = new Queue('order-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,  // 5s, 25s, 125s
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// Job types
interface OrderJob {
  type: 'process_order';
  orderId: string;
  etsyReceiptId: number;
  customization: ParsedCustomization;
  shippingAddress: ShippingAddress;
  productType: ProductType;
}

interface RetryJob {
  type: 'retry_failed';
  orderId: string;
  failedStep: OrderStatus;
  retryCount: number;
}
```

### 7.2 Worker Implementation

```typescript
const orderWorker = new Worker<OrderJob>(
  'order-processing',
  async (job: Job<OrderJob>) => {
    const { orderId, customization, productType, shippingAddress } = job.data;

    try {
      // Step 1: Geocode address
      await job.updateProgress(10);
      await updateOrderStatus(orderId, OrderStatus.GEOCODING);

      const coordinates = await geocodingService.geocode(
        formatAddress(customization)
      );

      if (coordinates.confidence === 'approximate') {
        throw new GeocodingError('Address too imprecise for accurate placement');
      }

      // Step 2: Generate map
      await job.updateProgress(30);
      await updateOrderStatus(orderId, OrderStatus.GENERATING_MAP);

      const mapSvg = await mapGenerationService.generate({
        lat: coordinates.lat,
        lng: coordinates.lng,
        radius: 400,
        style: 'classic',
        format: 'svg',
      });

      // Step 3: Compose artwork
      await job.updateProgress(50);
      await updateOrderStatus(orderId, OrderStatus.COMPOSING);

      const productSpec = PRODUCT_SPECS[productType];
      const artwork = await compositionEngine.compose({
        mapSvg,
        heartPosition: calculateHeartPosition(coordinates, mapSvg.bounds),
        customText: customization.custom_phrase,
        productSpec,
      });

      // Step 4: Upload to storage
      await job.updateProgress(70);
      await updateOrderStatus(orderId, OrderStatus.UPLOADING);

      const printFileUrl = await storageService.upload({
        buffer: artwork,
        key: `prints/${orderId}/${productType}_print.png`,
        contentType: 'image/png',
        public: true,
      });

      // Step 5: Submit to print provider
      await job.updateProgress(85);
      await updateOrderStatus(orderId, OrderStatus.SUBMITTING);

      const fulfillmentId = await printfulService.submitOrder({
        externalId: orderId,
        printFileUrl,
        productVariant: productSpec.printfulVariantId,
        shipping: shippingAddress,
      });

      // Step 6: Update final status
      await job.updateProgress(100);
      await updateOrderStatus(orderId, OrderStatus.IN_PRODUCTION, {
        fulfillmentId,
        printFileUrl,
      });

      return { success: true, fulfillmentId };

    } catch (error) {
      await handleJobError(orderId, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 5,  // Process 5 orders simultaneously
    limiter: {
      max: 10,
      duration: 1000,  // Max 10 jobs per second
    },
  }
);
```

### 7.3 Webhook Handlers

```typescript
// app/routes/api/webhooks/etsy.tsx
import { json, type ActionFunction } from '@remix-run/node';

export const action: ActionFunction = async ({ request }) => {
  // Verify webhook signature
  const signature = request.headers.get('x-etsy-signature');
  const rawBody = await request.text();

  if (!verifyEtsyWebhook(rawBody, signature, process.env.ETSY_WEBHOOK_SECRET)) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  switch (payload.event_type) {
    case 'receipt.created':
      await handleNewOrder(payload.data);
      break;
    case 'receipt.updated':
      await handleOrderUpdate(payload.data);
      break;
  }

  return json({ received: true });
};

async function handleNewOrder(receipt: EtsyReceipt) {
  // Parse each transaction in the order
  for (const transaction of receipt.transactions) {
    const customization = parseCustomization(transaction.personalization);

    if (!customization) {
      await flagForManualReview(receipt.receipt_id, 'Failed to parse customization');
      continue;
    }

    // Create order record
    const order = await createOrder({
      etsyReceiptId: receipt.receipt_id,
      etsyTransactionId: transaction.transaction_id,
      customization,
      productType: mapListingToProduct(transaction.listing_id),
      shippingAddress: receipt.shipping_address,
      status: OrderStatus.RECEIVED,
    });

    // Enqueue processing job
    await orderQueue.add('process', {
      type: 'process_order',
      orderId: order.id,
      ...order,
    });
  }
}
```

```typescript
// app/routes/api/webhooks/printful.tsx
export const action: ActionFunction = async ({ request }) => {
  const payload = await request.json();

  switch (payload.type) {
    case 'package_shipped':
      await handleShipment(payload.data);
      break;
    case 'order_failed':
      await handleFulfillmentFailure(payload.data);
      break;
  }

  return json({ received: true });
};

async function handleShipment(data: PrintfulShipmentData) {
  const order = await getOrderByFulfillmentId(data.order.external_id);

  // Update order status
  await updateOrderStatus(order.id, OrderStatus.SHIPPED, {
    trackingNumber: data.shipment.tracking_number,
    trackingUrl: data.shipment.tracking_url,
    carrier: data.shipment.carrier,
  });

  // Update Etsy order with tracking
  await etsyService.updateReceiptShipping(order.etsyReceiptId, {
    tracking_code: data.shipment.tracking_number,
    carrier_name: data.shipment.carrier,
  });
}
```

---

## 8. File Format & Rendering Requirements

### 8.1 Print File Specifications

| Product | Dimensions (px) | DPI | Format | Color Space | Background |
|---------|-----------------|-----|--------|-------------|------------|
| Mug 11oz | 2700 x 1100 | 300 | PNG | sRGB | White/Color |
| Mug 15oz | 2850 x 1200 | 300 | PNG | sRGB | White/Color |
| T-Shirt | 4500 x 5400 | 300 | PNG | sRGB | Transparent |
| Beer Glass (Can) | 2400 x 1800 | 300 | PNG | sRGB | White |
| Beer Glass (Pint) | 2100 x 2400 | 300 | PNG | sRGB | White |
| Poster 8x10 | 2400 x 3000 | 300 | PDF | sRGB | White |
| Poster 11x14 | 3300 x 4200 | 300 | PDF | sRGB | White |
| Poster 16x20 | 4800 x 6000 | 300 | PDF | sRGB | White |

### 8.2 File Naming Convention

```
{order_id}_{product_type}_{timestamp}.{format}

Examples:
ord_abc123_mug_11oz_1699123456.png
ord_def456_tshirt_unisex_1699123789.png
ord_ghi789_poster_11x14_1699124000.pdf
```

### 8.3 Storage Structure

```
/prints
  /{order_id}
    /raw
      map.svg              # Original generated map
    /composed
      artwork.png          # Final composed design
    /print_ready
      mug_11oz.png         # Print-ready file sent to POD
    /previews
      thumbnail.jpg        # Low-res preview for admin
      watermarked.jpg      # Customer preview
```

### 8.4 Image Quality Requirements

```typescript
const IMAGE_QUALITY_SPEC = {
  // Minimum requirements for print
  minResolution: 300,  // DPI
  minWidth: 1800,      // pixels

  // Color specifications
  colorSpace: 'sRGB',
  bitDepth: 8,

  // Compression
  png: {
    compressionLevel: 6,  // Balance size/quality
    interlace: false,
  },

  // For preview images
  preview: {
    maxWidth: 800,
    format: 'jpeg',
    quality: 80,
  },
};
```

---

## 9. Database Schema

### 9.1 Supabase Tables

```sql
-- Orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etsy_receipt_id BIGINT NOT NULL,
  etsy_transaction_id BIGINT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'received',

  -- Customer info (denormalized for quick access)
  customer_email VARCHAR(255),

  -- Product details
  product_type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,

  -- Customization
  street_address TEXT NOT NULL,
  city VARCHAR(255),
  state VARCHAR(100),
  country VARCHAR(100),
  postal_code VARCHAR(20),
  custom_phrase TEXT,

  -- Resolved coordinates
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  geocode_confidence VARCHAR(50),

  -- Fulfillment
  fulfillment_provider VARCHAR(50),
  fulfillment_order_id VARCHAR(255),
  tracking_number VARCHAR(255),
  tracking_url TEXT,

  -- Assets
  map_asset_url TEXT,
  print_file_url TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  fulfilled_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,

  -- Indexes
  UNIQUE(etsy_receipt_id, etsy_transaction_id)
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_etsy_receipt ON orders(etsy_receipt_id);

-- Order status history for debugging
CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_status_history_order ON order_status_history(order_id, created_at DESC);

-- Map cache to avoid regenerating identical maps
CREATE TABLE map_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key VARCHAR(255) UNIQUE NOT NULL,  -- lat_lng_radius_style hash
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  radius INTEGER NOT NULL,
  style VARCHAR(50) NOT NULL,
  svg_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  use_count INTEGER DEFAULT 1
);

CREATE INDEX idx_map_cache_key ON map_cache(cache_key);
CREATE INDEX idx_map_cache_location ON map_cache(latitude, longitude);

-- Failed jobs for manual review
CREATE TABLE failed_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  etsy_receipt_id BIGINT,
  failure_reason TEXT NOT NULL,
  failure_step VARCHAR(50),
  raw_customization TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_failed_orders_unresolved ON failed_orders(resolved, created_at DESC);

-- Audit log for compliance
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  action VARCHAR(100) NOT NULL,
  actor VARCHAR(255),  -- 'system', 'webhook:etsy', 'admin:user@email'
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_order ON audit_log(order_id, created_at DESC);
```

### 9.2 Database Functions

```sql
-- Update order status with history tracking
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_status VARCHAR(50),
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Update order
  UPDATE orders
  SET
    status = p_status,
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Record history
  INSERT INTO order_status_history (order_id, status, error_message, metadata)
  VALUES (p_order_id, p_status, p_error_message, p_metadata);
END;
$$ LANGUAGE plpgsql;

-- Get orders requiring attention
CREATE OR REPLACE FUNCTION get_problem_orders()
RETURNS TABLE (
  order_id UUID,
  etsy_receipt_id BIGINT,
  status VARCHAR(50),
  error_message TEXT,
  hours_stuck NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.etsy_receipt_id,
    o.status,
    h.error_message,
    EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 3600 AS hours_stuck
  FROM orders o
  LEFT JOIN LATERAL (
    SELECT error_message
    FROM order_status_history
    WHERE order_id = o.id
    ORDER BY created_at DESC
    LIMIT 1
  ) h ON true
  WHERE o.status LIKE '%_failed'
    OR (o.status NOT IN ('shipped', 'delivered', 'cancelled')
        AND o.updated_at < NOW() - INTERVAL '24 hours');
END;
$$ LANGUAGE plpgsql;
```

---

## 10. Error Handling & Recovery

### 10.1 Error Classification

```typescript
enum ErrorSeverity {
  RECOVERABLE = 'recoverable',     // Auto-retry will likely succeed
  MANUAL_REQUIRED = 'manual',      // Needs human intervention
  CUSTOMER_ERROR = 'customer',     // Invalid input from customer
  SYSTEM_FAILURE = 'system',       // Infrastructure issue
}

interface ClassifiedError {
  severity: ErrorSeverity;
  category: string;
  message: string;
  retryable: boolean;
  maxRetries: number;
  notifyCustomer: boolean;
  requiresRefund: boolean;
}

const ERROR_CLASSIFICATIONS: Record<string, ClassifiedError> = {
  // Geocoding errors
  'ADDRESS_NOT_FOUND': {
    severity: ErrorSeverity.CUSTOMER_ERROR,
    category: 'geocoding',
    message: 'We could not locate the address provided',
    retryable: false,
    maxRetries: 0,
    notifyCustomer: true,
    requiresRefund: true,
  },
  'ADDRESS_AMBIGUOUS': {
    severity: ErrorSeverity.CUSTOMER_ERROR,
    category: 'geocoding',
    message: 'The address is ambiguous, please provide more details',
    retryable: false,
    maxRetries: 0,
    notifyCustomer: true,
    requiresRefund: true,
  },
  'GEOCODING_RATE_LIMIT': {
    severity: ErrorSeverity.RECOVERABLE,
    category: 'geocoding',
    message: 'Geocoding service temporarily unavailable',
    retryable: true,
    maxRetries: 5,
    notifyCustomer: false,
    requiresRefund: false,
  },

  // Map generation errors
  'MAP_GENERATION_TIMEOUT': {
    severity: ErrorSeverity.RECOVERABLE,
    category: 'map_generation',
    message: 'Map generation timed out',
    retryable: true,
    maxRetries: 3,
    notifyCustomer: false,
    requiresRefund: false,
  },
  'NO_MAP_DATA': {
    severity: ErrorSeverity.MANUAL_REQUIRED,
    category: 'map_generation',
    message: 'No map data available for this location',
    retryable: false,
    maxRetries: 0,
    notifyCustomer: true,
    requiresRefund: true,
  },

  // Fulfillment errors
  'PRINTFUL_UNAVAILABLE': {
    severity: ErrorSeverity.RECOVERABLE,
    category: 'fulfillment',
    message: 'Print provider temporarily unavailable',
    retryable: true,
    maxRetries: 10,
    notifyCustomer: false,
    requiresRefund: false,
  },
  'PRODUCT_OUT_OF_STOCK': {
    severity: ErrorSeverity.MANUAL_REQUIRED,
    category: 'fulfillment',
    message: 'Selected product is out of stock',
    retryable: false,
    maxRetries: 0,
    notifyCustomer: true,
    requiresRefund: false,  // May offer alternative
  },
  'INVALID_SHIPPING_ADDRESS': {
    severity: ErrorSeverity.CUSTOMER_ERROR,
    category: 'fulfillment',
    message: 'Shipping address cannot be verified',
    retryable: false,
    maxRetries: 0,
    notifyCustomer: true,
    requiresRefund: true,
  },
};
```

### 10.2 Retry Strategy

```typescript
const RETRY_STRATEGIES: Record<string, RetryConfig> = {
  geocoding: {
    maxAttempts: 3,
    backoff: 'exponential',
    initialDelay: 2000,
    maxDelay: 30000,
    retryOn: ['RATE_LIMIT', 'TIMEOUT', 'NETWORK_ERROR'],
  },

  map_generation: {
    maxAttempts: 3,
    backoff: 'exponential',
    initialDelay: 5000,
    maxDelay: 60000,
    retryOn: ['TIMEOUT', 'MEMORY_ERROR', 'NETWORK_ERROR'],
  },

  fulfillment_submission: {
    maxAttempts: 5,
    backoff: 'exponential',
    initialDelay: 10000,
    maxDelay: 300000,  // 5 minutes
    retryOn: ['RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
  },
};

async function withRetry<T>(
  operation: () => Promise<T>,
  strategy: RetryConfig,
  context: { orderId: string; step: string }
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const errorCode = classifyError(error);
      if (!strategy.retryOn.includes(errorCode)) {
        throw error;  // Non-retryable error
      }

      if (attempt < strategy.maxAttempts) {
        const delay = calculateBackoff(strategy, attempt);
        await logRetryAttempt(context.orderId, context.step, attempt, delay);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
```

### 10.3 Dead Letter Queue Processing

```typescript
// Process orders that have exhausted retries
const dlqWorker = new Worker(
  'order-processing-dlq',
  async (job: Job) => {
    const { orderId, lastError, attempts } = job.data;

    const classification = classifyError(lastError);

    if (classification.requiresRefund) {
      // Flag for refund in Etsy
      await flagForRefund(orderId, classification.message);
    }

    // Create manual review ticket
    await createFailedOrderRecord({
      orderId,
      failureReason: classification.message,
      failureStep: job.data.failedStep,
      rawCustomization: job.data.customization,
    });

    // Send alert to admin
    await sendAdminAlert({
      type: 'order_failed',
      orderId,
      error: classification.message,
      requiresAction: classification.severity === ErrorSeverity.MANUAL_REQUIRED,
    });
  },
  { connection }
);
```

### 10.4 Graceful Degradation

```typescript
// Fallback chain for geocoding
async function geocodeWithFallbacks(address: string): Promise<GeocodingResult> {
  const providers = [
    { name: 'google', service: googleGeocodingService },
    { name: 'nominatim', service: nominatimGeocodingService },
    { name: 'mapbox', service: mapboxGeocodingService },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.service.geocode(address);
      if (result.confidence !== 'approximate') {
        return { ...result, provider: provider.name };
      }
    } catch (error) {
      console.warn(`Geocoding failed with ${provider.name}:`, error.message);
      continue;
    }
  }

  throw new GeocodingError('All geocoding providers failed');
}
```

---

## 11. Scalability Architecture

### 11.1 Horizontal Scaling Model

```
                         ┌─────────────────────────────────────┐
                         │         LOAD BALANCER              │
                         │       (Netlify Edge / CF)          │
                         └─────────────────┬───────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
              ▼                            ▼                            ▼
    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
    │  Remix Instance │          │  Remix Instance │          │  Remix Instance │
    │   (Serverless)  │          │   (Serverless)  │          │   (Serverless)  │
    └────────┬────────┘          └────────┬────────┘          └────────┬────────┘
             │                            │                            │
             └────────────────────────────┼────────────────────────────┘
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │    REDIS CLUSTER      │
                              │   (Queue + Cache)     │
                              └───────────┬───────────┘
                                          │
         ┌────────────────────────────────┼────────────────────────────┐
         │                                │                            │
         ▼                                ▼                            ▼
┌─────────────────┐              ┌─────────────────┐          ┌─────────────────┐
│  Worker Node 1  │              │  Worker Node 2  │          │  Worker Node N  │
│  (Railway/Fly)  │              │  (Railway/Fly)  │          │  (Railway/Fly)  │
│                 │              │                 │          │                 │
│ - Order Process │              │ - Order Process │          │ - Order Process │
│ - Map Generate  │              │ - Map Generate  │          │ - Map Generate  │
└─────────────────┘              └─────────────────┘          └─────────────────┘
         │                                │                            │
         └────────────────────────────────┼────────────────────────────┘
                                          │
                              ┌───────────┴───────────┐
                              │                       │
                              ▼                       ▼
                    ┌─────────────────┐     ┌─────────────────┐
                    │    Supabase     │     │  Cloudflare R2  │
                    │   (PostgreSQL)  │     │   (Storage)     │
                    └─────────────────┘     └─────────────────┘
```

### 11.2 Auto-Scaling Configuration

```typescript
// Worker scaling based on queue depth
const SCALING_CONFIG = {
  minWorkers: 1,
  maxWorkers: 10,
  scaleUpThreshold: 50,   // Queue depth to trigger scale up
  scaleDownThreshold: 10, // Queue depth to trigger scale down
  cooldownPeriod: 300,    // Seconds between scaling actions

  // Time-based scaling for predictable patterns
  schedules: [
    { cron: '0 9 * * 1-5', minWorkers: 3 },   // Weekday mornings
    { cron: '0 18 * * 1-5', minWorkers: 2 },  // Weekday evenings
    { cron: '0 10 * * 0,6', minWorkers: 4 },  // Weekend peak
  ],
};

// Monitor and scale
async function checkScaling() {
  const queueDepth = await orderQueue.count();
  const activeWorkers = await getActiveWorkerCount();

  if (queueDepth > SCALING_CONFIG.scaleUpThreshold * activeWorkers) {
    const newCount = Math.min(activeWorkers + 1, SCALING_CONFIG.maxWorkers);
    await scaleWorkers(newCount);
  } else if (queueDepth < SCALING_CONFIG.scaleDownThreshold && activeWorkers > SCALING_CONFIG.minWorkers) {
    const newCount = Math.max(activeWorkers - 1, SCALING_CONFIG.minWorkers);
    await scaleWorkers(newCount);
  }
}
```

### 11.3 Performance Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Order processing time | < 2 minutes | > 5 minutes |
| Map generation time | < 30 seconds | > 60 seconds |
| Webhook response time | < 500ms | > 2 seconds |
| Queue depth (normal) | < 100 | > 500 |
| Error rate | < 1% | > 5% |
| Fulfillment submission | < 10 seconds | > 30 seconds |

### 11.4 Capacity Planning

```typescript
// Estimated resource consumption per order
const RESOURCE_ESTIMATES = {
  map_generation: {
    cpu_seconds: 15,
    memory_mb: 512,
    network_mb: 2,
  },
  composition: {
    cpu_seconds: 5,
    memory_mb: 256,
  },
  storage: {
    raw_map_mb: 0.5,
    composed_mb: 2,
    print_ready_mb: 5,
  },
};

// Monthly projections at different order volumes
const CAPACITY_PROJECTIONS = {
  orders_100_month: {
    storage_gb: 0.75,
    compute_hours: 0.6,
    api_calls: {
      geocoding: 100,
      etsy: 300,
      printful: 100,
    },
  },
  orders_1000_month: {
    storage_gb: 7.5,
    compute_hours: 6,
    api_calls: {
      geocoding: 1000,
      etsy: 3000,
      printful: 1000,
    },
  },
  orders_10000_month: {
    storage_gb: 75,
    compute_hours: 60,
    api_calls: {
      geocoding: 10000,
      etsy: 30000,
      printful: 10000,
    },
  },
};
```

---

## 12. Security Considerations

### 12.1 API Key Management

```typescript
// Environment variables (never commit these)
const REQUIRED_SECRETS = [
  'ETSY_API_KEY',
  'ETSY_SHARED_SECRET',
  'ETSY_WEBHOOK_SECRET',
  'GOOGLE_MAPS_API_KEY',
  'PRINTFUL_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'REDIS_URL',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'SESSION_SECRET',
];

// Validate all secrets at startup
function validateSecrets() {
  const missing = REQUIRED_SECRETS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }
}
```

### 12.2 Webhook Security

```typescript
// Verify all incoming webhooks
const WEBHOOK_VERIFIERS: Record<string, WebhookVerifier> = {
  etsy: {
    headerName: 'x-etsy-signature',
    algorithm: 'sha256',
    encoding: 'hex',
  },
  printful: {
    headerName: 'x-pf-webhook-signature',
    algorithm: 'sha256',
    encoding: 'base64',
  },
};

function createWebhookMiddleware(provider: string) {
  const config = WEBHOOK_VERIFIERS[provider];

  return async (request: Request) => {
    const signature = request.headers.get(config.headerName);
    const body = await request.text();

    const expected = crypto
      .createHmac(config.algorithm, process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`])
      .update(body)
      .digest(config.encoding);

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new WebhookVerificationError(`Invalid ${provider} webhook signature`);
    }

    return JSON.parse(body);
  };
}
```

### 12.3 Data Privacy

```typescript
// PII fields that require special handling
const PII_FIELDS = [
  'customer_email',
  'street_address',
  'shipping_address',
  'buyer_name',
];

// Log sanitization
function sanitizeForLogging(data: Record<string, any>): Record<string, any> {
  const sanitized = { ...data };

  for (const field of PII_FIELDS) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

// Data retention policy
const DATA_RETENTION = {
  orders: {
    active: 'indefinite',
    completed: '2 years',
    cancelled: '90 days',
  },
  logs: {
    application: '30 days',
    audit: '7 years',
    error: '90 days',
  },
  assets: {
    print_files: '30 days after fulfillment',
    previews: '7 days',
    map_cache: '90 days',
  },
};
```

### 12.4 Rate Limiting

```typescript
// Protect webhook endpoints
const RATE_LIMITS = {
  webhooks: {
    windowMs: 60 * 1000,  // 1 minute
    max: 100,             // requests per window
  },
  api: {
    windowMs: 60 * 1000,
    max: 60,
  },
};

// IP-based rate limiting for webhooks
import rateLimit from 'express-rate-limit';

const webhookLimiter = rateLimit({
  windowMs: RATE_LIMITS.webhooks.windowMs,
  max: RATE_LIMITS.webhooks.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use Etsy's known IP ranges if available
    return req.ip;
  },
});
```

---

## 13. Monitoring & Observability

### 13.1 Key Metrics

```typescript
// Prometheus-style metrics
const METRICS = {
  // Order flow
  orders_received_total: Counter,
  orders_completed_total: Counter,
  orders_failed_total: Counter,
  order_processing_duration_seconds: Histogram,

  // Pipeline stages
  geocoding_duration_seconds: Histogram,
  geocoding_errors_total: Counter,
  map_generation_duration_seconds: Histogram,
  map_generation_errors_total: Counter,
  composition_duration_seconds: Histogram,
  fulfillment_submission_duration_seconds: Histogram,

  // Queue health
  queue_depth: Gauge,
  queue_latency_seconds: Histogram,
  dlq_depth: Gauge,

  // External services
  etsy_api_latency_seconds: Histogram,
  printful_api_latency_seconds: Histogram,
  google_maps_api_latency_seconds: Histogram,

  // Resources
  storage_bytes_used: Gauge,
  worker_memory_bytes: Gauge,
};
```

### 13.2 Alerting Rules

```yaml
# alerts.yml
groups:
  - name: order_processing
    rules:
      - alert: HighOrderFailureRate
        expr: rate(orders_failed_total[5m]) / rate(orders_received_total[5m]) > 0.05
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Order failure rate above 5%"

      - alert: OrderProcessingBacklog
        expr: queue_depth > 500
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Order queue backlog building up"

      - alert: SlowOrderProcessing
        expr: histogram_quantile(0.95, order_processing_duration_seconds) > 300
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "95th percentile order processing time above 5 minutes"

      - alert: ExternalServiceDown
        expr: up{job=~"printful|etsy|google_maps"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "External service {{ $labels.job }} is down"
```

### 13.3 Logging Structure

```typescript
// Structured logging format
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  orderId?: string;
  step?: string;
  duration_ms?: number;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

// Example log entries
const logExamples = [
  {
    timestamp: '2024-01-15T10:30:00Z',
    level: 'info',
    service: 'order-worker',
    orderId: 'ord_abc123',
    step: 'geocoding',
    duration_ms: 245,
    metadata: { provider: 'google', confidence: 'rooftop' },
  },
  {
    timestamp: '2024-01-15T10:30:05Z',
    level: 'error',
    service: 'order-worker',
    orderId: 'ord_abc123',
    step: 'map_generation',
    error: {
      code: 'MAP_GENERATION_TIMEOUT',
      message: 'Map generation exceeded 30s timeout',
    },
  },
];
```

### 13.4 Dashboard Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ORDER PROCESSING DASHBOARD                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │ Orders Today     │  │ Success Rate     │  │ Avg Process Time │           │
│  │     147          │  │    98.6%         │  │    1m 42s        │           │
│  │   ▲ +23%         │  │   ▲ +0.4%        │  │   ▼ -12s         │           │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Order Volume (24h)                                                  │    │
│  │  ███████████████████████████████████████████████████████████████    │    │
│  │  12am  3am   6am   9am   12pm  3pm   6pm   9pm                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────┐  ┌────────────────────────────────────┐     │
│  │ Pipeline Stage Latency     │  │ Error Distribution                 │     │
│  │                            │  │                                    │     │
│  │ Geocoding    ████░ 0.3s    │  │ Geocoding      ████████░░ 40%     │     │
│  │ Map Gen      ██████████ 15s│  │ Map Gen        ████░░░░░░ 20%     │     │
│  │ Composition  ████░░░░░░ 3s │  │ Fulfillment    ██████░░░░ 30%     │     │
│  │ Upload       ███░░░░░░░ 2s │  │ Other          ██░░░░░░░░ 10%     │     │
│  │ Submit       █████░░░░░ 5s │  │                                    │     │
│  └────────────────────────────┘  └────────────────────────────────────┘     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Queue Status                                                         │    │
│  │ Pending: 23  │  In Progress: 5  │  Failed (DLQ): 2                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Cost Analysis

### 14.1 Fixed Costs (Monthly)

| Service | Tier | Cost |
|---------|------|------|
| Supabase | Pro | $25 |
| Redis (Upstash) | Pay-as-you-go | ~$10 |
| Cloudflare R2 | Pay-as-you-go | ~$5 |
| Railway (Workers) | Starter | $5 + usage |
| Domain | Annual | ~$1 |
| **Total Fixed** | | **~$46/month** |

### 14.2 Variable Costs (Per Order)

| Service | Unit Cost | Est. Usage | Per Order |
|---------|-----------|------------|-----------|
| Google Geocoding | $5/1000 | 1 call | $0.005 |
| Map Generation | $0.01 compute | 15 sec | $0.01 |
| Storage (R2) | $0.015/GB | 8 MB | $0.0001 |
| Printful (example) | $8.95 base | 1 mug | $8.95 |
| Etsy Fees | 6.5% + $0.20 | $25 sale | $1.83 |
| **Total Variable** | | | **~$10.80** |

### 14.3 Break-Even Analysis

```
Assumptions:
- Average sale price: $29.99
- Product cost (Printful): $8.95
- Shipping (customer pays): $0
- Platform fees (Etsy): $2.15
- Processing costs: $0.02

Gross margin per order: $29.99 - $8.95 - $2.15 - $0.02 = $18.87

Break-even orders: $46 / $18.87 ≈ 3 orders/month

Profit at different volumes:
- 10 orders/month:  10 × $18.87 - $46 = $142.70
- 50 orders/month:  50 × $18.87 - $46 = $897.50
- 100 orders/month: 100 × $18.87 - $46 = $1,841.00
- 500 orders/month: 500 × $18.87 - $56 = $9,379.00 (scaled infra)
```

### 14.4 API Quota Management

```typescript
// Track API usage to stay within free tiers
const API_QUOTAS = {
  google_geocoding: {
    free_tier: 0,           // No free tier
    monthly_budget: 200,    // $40/month budget = 200 calls
    current_usage: 0,
  },
  etsy_api: {
    free_tier: 10000,
    monthly_budget: 10000,
    current_usage: 0,
  },
  printful_api: {
    free_tier: Infinity,    // No limits on paid orders
    monthly_budget: Infinity,
    current_usage: 0,
  },
};

async function checkQuota(service: string): Promise<boolean> {
  const quota = API_QUOTAS[service];
  if (quota.current_usage >= quota.monthly_budget) {
    await sendAlert(`${service} API quota exhausted`);
    return false;
  }
  return true;
}
```

---

## 15. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Supabase database with schema
- [ ] Configure Redis queue infrastructure
- [ ] Implement Etsy OAuth and webhook receiver
- [ ] Basic order ingestion and validation

### Phase 2: Map Pipeline (Week 3-4)
- [ ] Deploy Python map generation microservice
- [ ] Implement geocoding with fallbacks
- [ ] Create artwork composition engine
- [ ] Set up asset storage on R2

### Phase 3: Fulfillment (Week 5-6)
- [ ] Integrate Printful API
- [ ] Implement order submission flow
- [ ] Set up fulfillment webhooks
- [ ] Etsy order status sync

### Phase 4: Hardening (Week 7-8)
- [ ] Error handling and retry logic
- [ ] Monitoring and alerting
- [ ] Admin dashboard for manual review
- [ ] Load testing and optimization

### Phase 5: Launch (Week 9)
- [ ] Etsy listing creation
- [ ] End-to-end testing with real orders
- [ ] Documentation and runbooks
- [ ] Go live

---

## Appendix A: Etsy Listing Configuration

### Personalization Fields Setup

```
Field 1: "Address"
- Required: Yes
- Placeholder: "123 Main St, City, State 12345, Country"
- Character limit: 500

Field 2: "Custom Text (Optional)"
- Required: No
- Placeholder: "Our First Home"
- Character limit: 100
```

### Listing Description Template

```
📍 PERSONALIZED MAP ART

Celebrate your special place with a beautiful, custom map design featuring:

✓ A stylized artistic map of your chosen location
✓ A heart marker at your exact address
✓ Your custom text (optional)

PERFECT FOR:
• First home memories
• Wedding venues
• Where you met
• Childhood homes
• Favorite vacation spots

HOW TO ORDER:
1. Enter your full address (including country)
2. Add optional custom text
3. Select your product

FORMAT: Address should be entered as:
Street, City, State/Province, Postal Code, Country

Example: 123 Main Street, Brooklyn, NY 11201, USA

PRODUCTION: Your item is created automatically and shipped within 3-5 business days.
```

---

## Appendix B: Error Message Templates

```typescript
const CUSTOMER_ERROR_MESSAGES = {
  ADDRESS_NOT_FOUND: `
We couldn't locate the address you provided. Please ensure you've entered:
- Full street address with number
- City and state/province
- Postal/ZIP code
- Country

If your order cannot be fulfilled, you will receive a full refund within 3-5 business days.
  `,

  ADDRESS_AMBIGUOUS: `
The address you provided matches multiple locations. Please provide more specific details such as:
- Apartment/unit number
- Building name
- Nearest cross street

Reply to this message with the clarified address and we'll process your order.
  `,

  SHIPPING_INVALID: `
We were unable to verify your shipping address. Please confirm:
- Street address is complete
- City name is spelled correctly
- Postal code matches the city
- Country is included

Please reply with your corrected shipping address.
  `,
};
```

---

*Document Version: 1.0*
*Last Updated: 2024-01*
*Author: System Design Team*
