/**
 * Printify API Integration
 *
 * Handles image uploads, product creation, and order submission
 * for beer can glass fulfillment.
 */

// Types
export interface PrintifyImage {
  id: string;
  file_name: string;
  height: number;
  width: number;
  size: number;
  mime_type: string;
  preview_url: string;
}

export interface PrintifyShipment {
  carrier: string;
  number: string;
  url: string;
  delivered_at: string | null;
}

export interface PrintifyOrder {
  id: string;
  address_to: PrintifyAddress;
  line_items: PrintifyLineItem[];
  metadata: {
    order_type: string;
    shop_order_id: number;
    shop_order_label: string;
    shop_fulfilled_at: string | null;
  };
  total_price: number;
  total_shipping: number;
  total_tax: number;
  status: string;
  shipping_method: number;
  is_printify_express: boolean;
  send_shipping_notification: boolean;
  created_at: string;
  shipments: PrintifyShipment[];
}

export interface PrintifyAddress {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  region: string;
  address1: string;
  address2: string;
  city: string;
  zip: string;
}

export interface PrintifyLineItem {
  product_id?: string;
  quantity: number;
  variant_id: number;
  print_provider_id?: number;
  blueprint_id?: number;
  print_areas?: Record<string, string>;
}

export interface PrintifyWebhook {
  id: string;
  topic: string;
  url: string;
  shop_id: string;
}

// Configuration
const PRINTIFY_API_KEY = process.env.PRINTIFY_API_KEY || "";
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID || "";
const PRINTIFY_API_BASE = "https://api.printify.com/v1";

// Product constants for beer can glasses (Sipper Glass 16oz)
// You'll need to look up the actual variant IDs from the catalog
export const GLASS_BLUEPRINT_ID = 1441; // Sipper Glass 16oz
export const GLASS_PRINT_PROVIDER_ID = 1; // Default provider - check catalog

// These variant IDs need to be looked up via API
// GET /v1/catalog/blueprints/1441/print_providers/{provider_id}/variants.json
export const GLASS_VARIANT_IDS = {
  clear: 0, // Will be populated from catalog lookup
};

/**
 * Make authenticated Printify API request
 */
async function printifyRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${PRINTIFY_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${PRINTIFY_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printify API error (${response.status}): ${error}`);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) return {} as T;

  return JSON.parse(text);
}

/**
 * Upload image to Printify via URL
 */
export async function uploadImageFromUrl(
  imageUrl: string,
  fileName: string
): Promise<PrintifyImage> {
  return printifyRequest<PrintifyImage>("/uploads/images.json", {
    method: "POST",
    body: JSON.stringify({
      file_name: fileName,
      url: imageUrl,
    }),
  });
}

/**
 * Upload image to Printify via base64
 */
export async function uploadImageFromBase64(
  base64Data: string,
  fileName: string
): Promise<PrintifyImage> {
  return printifyRequest<PrintifyImage>("/uploads/images.json", {
    method: "POST",
    body: JSON.stringify({
      file_name: fileName,
      contents: base64Data,
    }),
  });
}

/**
 * Get available print providers for blueprint
 */
export async function getPrintProviders(
  blueprintId: number
): Promise<
  Array<{ id: number; title: string; location: { country: string } }>
> {
  return printifyRequest(
    `/catalog/blueprints/${blueprintId}/print_providers.json`
  );
}

/**
 * Get variants for a blueprint and print provider
 */
export async function getVariants(
  blueprintId: number,
  printProviderId: number
): Promise<{ variants: Array<{ id: number; title: string; options: any }> }> {
  return printifyRequest(
    `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`
  );
}

/**
 * Create order with inline product (no need to create product first)
 */
export async function createOrder(params: {
  externalId: string;
  imageUrl: string;
  variantId: number;
  quantity: number;
  shippingAddress: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    country: string;
    zip: string;
  };
  sendShippingNotification?: boolean;
}): Promise<PrintifyOrder> {
  const {
    externalId,
    imageUrl,
    variantId,
    quantity,
    shippingAddress,
    sendShippingNotification = true,
  } = params;

  const orderPayload = {
    external_id: externalId,
    label: `Order ${externalId}`,
    line_items: [
      {
        print_provider_id: GLASS_PRINT_PROVIDER_ID,
        blueprint_id: GLASS_BLUEPRINT_ID,
        variant_id: variantId,
        print_areas: {
          front: imageUrl,
        },
        quantity: quantity,
      },
    ],
    shipping_method: 1, // Standard shipping
    send_shipping_notification: sendShippingNotification,
    address_to: {
      first_name: shippingAddress.firstName,
      last_name: shippingAddress.lastName,
      email: shippingAddress.email,
      phone: shippingAddress.phone || "",
      country: shippingAddress.country,
      region: shippingAddress.state,
      address1: shippingAddress.address1,
      address2: shippingAddress.address2 || "",
      city: shippingAddress.city,
      zip: shippingAddress.zip,
    },
  };

  return printifyRequest(`/shops/${PRINTIFY_SHOP_ID}/orders.json`, {
    method: "POST",
    body: JSON.stringify(orderPayload),
  });
}

/**
 * Send order to production
 * Must be called after createOrder to start fulfillment
 */
export async function sendToProduction(orderId: string): Promise<void> {
  await printifyRequest(
    `/shops/${PRINTIFY_SHOP_ID}/orders/${orderId}/send_to_production.json`,
    { method: "POST" }
  );
}

/**
 * Get order by ID
 */
export async function getOrder(orderId: string): Promise<PrintifyOrder> {
  return printifyRequest(`/shops/${PRINTIFY_SHOP_ID}/orders/${orderId}.json`);
}

/**
 * Get order by external ID
 */
export async function getOrderByExternalId(
  externalId: string
): Promise<PrintifyOrder | null> {
  const orders = await printifyRequest<PrintifyOrder[]>(
    `/shops/${PRINTIFY_SHOP_ID}/orders.json`
  );

  return orders.find((o) => o.metadata?.shop_order_label === externalId) || null;
}

/**
 * Cancel order (only works if not in production)
 */
export async function cancelOrder(orderId: string): Promise<void> {
  await printifyRequest(
    `/shops/${PRINTIFY_SHOP_ID}/orders/${orderId}/cancel.json`,
    { method: "POST" }
  );
}

/**
 * Create webhook subscription
 */
export async function createWebhook(
  topic: string,
  url: string
): Promise<PrintifyWebhook> {
  return printifyRequest(`/shops/${PRINTIFY_SHOP_ID}/webhooks.json`, {
    method: "POST",
    body: JSON.stringify({ topic, url }),
  });
}

/**
 * List webhooks
 */
export async function listWebhooks(): Promise<PrintifyWebhook[]> {
  return printifyRequest(`/shops/${PRINTIFY_SHOP_ID}/webhooks.json`);
}

/**
 * Delete webhook
 */
export async function deleteWebhook(webhookId: string): Promise<void> {
  await printifyRequest(
    `/shops/${PRINTIFY_SHOP_ID}/webhooks/${webhookId}.json`,
    { method: "DELETE" }
  );
}

/**
 * Get shops (to find shop ID)
 */
export async function getShops(): Promise<
  Array<{ id: number; title: string; sales_channel: string }>
> {
  return printifyRequest("/shops.json");
}

/**
 * Verify webhook is from Printify (basic check)
 * Printify doesn't provide HMAC signatures, so we rely on URL secrecy
 */
export function isValidWebhookPayload(payload: any): boolean {
  return (
    payload &&
    typeof payload.type === "string" &&
    typeof payload.resource === "object"
  );
}

/**
 * Parse webhook payload
 */
export interface PrintifyWebhookPayload {
  id: string;
  type: string;
  created_at: string;
  resource: {
    id: string;
    shop_id: string;
    external_id: string;
    status: string;
    shipments?: PrintifyShipment[];
  };
}

export function parseWebhookPayload(body: string): PrintifyWebhookPayload {
  return JSON.parse(body);
}

/**
 * Complete order flow helper
 *
 * 1. Upload image
 * 2. Create order with image
 * 3. Send to production
 */
export async function submitFullOrder(params: {
  externalId: string;
  imageUrl: string;
  variantId: number;
  quantity: number;
  shippingAddress: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    country: string;
    zip: string;
  };
}): Promise<{ orderId: string; status: string }> {
  // Create order (image URL is used directly)
  const order = await createOrder(params);

  // Send to production
  await sendToProduction(order.id);

  return {
    orderId: order.id,
    status: "sent_to_production",
  };
}

/**
 * Look up glass variant ID from catalog
 * Run this once to get the correct variant ID for your product
 */
export async function lookupGlassVariants(): Promise<
  Array<{ id: number; title: string }>
> {
  const providers = await getPrintProviders(GLASS_BLUEPRINT_ID);

  if (providers.length === 0) {
    throw new Error("No print providers found for beer glass blueprint");
  }

  // Get first US-based provider
  const usProvider =
    providers.find((p) => p.location.country === "US") || providers[0];

  const { variants } = await getVariants(GLASS_BLUEPRINT_ID, usProvider.id);

  return variants.map((v) => ({ id: v.id, title: v.title }));
}
