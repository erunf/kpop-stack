/**
 * Etsy API Integration
 *
 * Handles OAuth 2.0 with PKCE, order fetching, and shipment updates.
 * Uses polling approach as primary method (webhooks require commercial access).
 */

import crypto from "crypto";

// Types
export interface EtsyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp
}

export interface EtsyReceipt {
  receipt_id: number;
  receipt_type: number;
  seller_user_id: number;
  seller_email: string;
  buyer_user_id: number;
  buyer_email: string;
  name: string;
  first_line: string;
  second_line: string | null;
  city: string;
  state: string;
  zip: string;
  country_iso: string;
  payment_method: string;
  payment_email: string;
  message_from_seller: string | null;
  message_from_buyer: string | null;
  message_from_payment: string | null;
  is_paid: boolean;
  is_shipped: boolean;
  create_timestamp: number;
  update_timestamp: number;
  is_gift: boolean;
  gift_message: string;
  grandtotal: { amount: number; divisor: number; currency_code: string };
  subtotal: { amount: number; divisor: number; currency_code: string };
  total_price: { amount: number; divisor: number; currency_code: string };
  total_shipping_cost: { amount: number; divisor: number; currency_code: string };
  total_tax_cost: { amount: number; divisor: number; currency_code: string };
  total_vat_cost: { amount: number; divisor: number; currency_code: string };
  discount_amt: { amount: number; divisor: number; currency_code: string };
  gift_wrap_price: { amount: number; divisor: number; currency_code: string };
  shipments: EtsyShipment[];
  transactions: EtsyTransaction[];
}

export interface EtsyTransaction {
  transaction_id: number;
  title: string;
  description: string;
  seller_user_id: number;
  buyer_user_id: number;
  create_timestamp: number;
  paid_timestamp: number;
  shipped_timestamp: number | null;
  quantity: number;
  listing_image_id: number;
  receipt_id: number;
  is_digital: boolean;
  file_data: string;
  listing_id: number;
  transaction_type: string;
  product_id: number;
  sku: string;
  price: { amount: number; divisor: number; currency_code: string };
  shipping_cost: { amount: number; divisor: number; currency_code: string };
  variations: EtsyVariation[];
  product_data: any;
  shipping_profile_id: number;
  min_processing_days: number;
  max_processing_days: number;
  shipping_method: string | null;
  shipping_upgrade: string | null;
  expected_ship_date: number | null;
  buyer_coupon: number;
  shop_coupon: number;
}

export interface EtsyVariation {
  property_id: number;
  value_id: number;
  formatted_name: string;
  formatted_value: string;
}

export interface EtsyShipment {
  receipt_shipping_id: number;
  shipment_notification_timestamp: number;
  carrier_name: string;
  tracking_code: string;
}

export interface ParsedCustomization {
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  customText: string | null;
  fullAddress: string;
}

// Environment variables
const ETSY_API_KEY = process.env.ETSY_API_KEY || "";
const ETSY_REDIRECT_URI = process.env.ETSY_REDIRECT_URI || "";
const ETSY_SHOP_ID = process.env.ETSY_SHOP_ID || "";

const ETSY_AUTH_URL = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const ETSY_API_BASE = "https://openapi.etsy.com/v3/application";

/**
 * Generate PKCE code verifier and challenge
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  // Generate 32 random bytes for verifier
  const verifier = crypto.randomBytes(32).toString("base64url");

  // SHA256 hash of verifier, base64url encoded
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  return { verifier, challenge };
}

/**
 * Generate random state for OAuth
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Build Etsy OAuth authorization URL
 */
export function getAuthorizationUrl(
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: ETSY_API_KEY,
    redirect_uri: ETSY_REDIRECT_URI,
    scope: "transactions_r transactions_w shops_r",
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${ETSY_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<EtsyTokens> {
  const response = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: ETSY_API_KEY,
      redirect_uri: ETSY_REDIRECT_URI,
      code: code,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<EtsyTokens> {
  const response = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: ETSY_API_KEY,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Make authenticated Etsy API request
 */
async function etsyApiRequest<T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${ETSY_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-api-key": ETSY_API_KEY,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Get shop receipts (orders)
 */
export async function getShopReceipts(
  accessToken: string,
  options: {
    minLastModified?: number;
    wasPaid?: boolean;
    wasShipped?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ count: number; results: EtsyReceipt[] }> {
  const params = new URLSearchParams();

  if (options.minLastModified) {
    params.set("min_last_modified", options.minLastModified.toString());
  }
  if (options.wasPaid !== undefined) {
    params.set("was_paid", options.wasPaid.toString());
  }
  if (options.wasShipped !== undefined) {
    params.set("was_shipped", options.wasShipped.toString());
  }
  if (options.limit) {
    params.set("limit", options.limit.toString());
  }
  if (options.offset) {
    params.set("offset", options.offset.toString());
  }

  const endpoint = `/shops/${ETSY_SHOP_ID}/receipts?${params.toString()}`;
  return etsyApiRequest(endpoint, accessToken);
}

/**
 * Get single receipt by ID
 */
export async function getReceipt(
  accessToken: string,
  receiptId: number
): Promise<EtsyReceipt> {
  const endpoint = `/shops/${ETSY_SHOP_ID}/receipts/${receiptId}`;
  return etsyApiRequest(endpoint, accessToken);
}

/**
 * Add tracking to receipt (mark as shipped)
 */
export async function addReceiptTracking(
  accessToken: string,
  receiptId: number,
  trackingCode: string,
  carrierName: string
): Promise<void> {
  const endpoint = `/shops/${ETSY_SHOP_ID}/receipts/${receiptId}/tracking`;

  // IMPORTANT: Etsy requires x-www-form-urlencoded for this endpoint
  const body = new URLSearchParams({
    tracking_code: trackingCode,
    carrier_name: carrierName,
    send_bcc: "true",
  });

  await etsyApiRequest(endpoint, accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
}

/**
 * Parse personalization from buyer message or transaction data
 *
 * Expected format in personalization:
 * Address: 123 Main St, City, State 12345, Country
 * Text: Our First Home
 */
export function parsePersonalization(
  receipt: EtsyReceipt
): ParsedCustomization | null {
  // First, check message from buyer
  let text = receipt.message_from_buyer || "";

  // Also check transaction variations for personalization
  for (const transaction of receipt.transactions) {
    for (const variation of transaction.variations) {
      if (
        variation.formatted_name.toLowerCase().includes("address") ||
        variation.formatted_name.toLowerCase().includes("personalization")
      ) {
        text += "\n" + variation.formatted_value;
      }
    }
  }

  // Parse address
  const addressMatch = text.match(/address[:\s]*([^\n]+)/i);
  const textMatch = text.match(/text[:\s]*([^\n]+)/i);

  if (!addressMatch) {
    // Try to use shipping address as fallback
    if (receipt.first_line) {
      return {
        address: receipt.first_line,
        city: receipt.city,
        state: receipt.state,
        country: receipt.country_iso,
        postalCode: receipt.zip,
        customText: textMatch ? textMatch[1].trim() : null,
        fullAddress: `${receipt.first_line}, ${receipt.city}, ${receipt.state} ${receipt.zip}, ${receipt.country_iso}`,
      };
    }
    return null;
  }

  const fullAddress = addressMatch[1].trim();

  // Try to parse address components
  // Format: "123 Main St, City, State 12345, Country"
  const parts = fullAddress.split(",").map((p) => p.trim());

  let address = parts[0] || "";
  let city = parts[1] || "";
  let stateZip = parts[2] || "";
  let country = parts[3] || "US";

  // Parse state and zip
  const stateZipMatch = stateZip.match(/([A-Za-z]+)\s*(\d+)/);
  let state = "";
  let postalCode = "";
  if (stateZipMatch) {
    state = stateZipMatch[1];
    postalCode = stateZipMatch[2];
  } else {
    state = stateZip;
  }

  return {
    address,
    city,
    state,
    country,
    postalCode,
    customText: textMatch ? textMatch[1].trim() : null,
    fullAddress,
  };
}

/**
 * Get new unprocessed orders
 * Call this periodically (e.g., every 5 minutes) to poll for new orders
 */
export async function getNewOrders(
  accessToken: string,
  sinceTimestamp: number
): Promise<EtsyReceipt[]> {
  const { results } = await getShopReceipts(accessToken, {
    minLastModified: sinceTimestamp,
    wasPaid: true,
    wasShipped: false,
    limit: 100,
  });

  return results;
}

/**
 * Carrier name mapping for Etsy
 */
export const CARRIER_MAP: Record<string, string> = {
  usps: "usps",
  "united states postal service": "usps",
  ups: "ups",
  fedex: "fedex",
  dhl: "dhl",
  "dhl express": "dhl",
  "canada post": "canada-post",
  "royal mail": "royal-mail",
  "australia post": "australia-post",
};

export function normalizeCarrierName(carrier: string): string {
  const lower = carrier.toLowerCase();
  return CARRIER_MAP[lower] || lower;
}
