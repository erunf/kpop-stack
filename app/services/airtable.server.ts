/**
 * Airtable Integration
 *
 * Simple order tracking using Airtable as the database.
 * Free tier supports up to 1,200 records per base.
 */

// Types
export interface OrderRecord {
  id?: string;
  etsyReceiptId: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  shippingCountry: string;
  mapAddress: string;
  customText: string;
  latitude?: number;
  longitude?: number;
  printFileUrl?: string;
  printifyOrderId?: string;
  trackingNumber?: string;
  trackingCarrier?: string;
  trackingUrl?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  shippedAt?: string;
}

export type OrderStatus =
  | "pending"
  | "geocoding"
  | "generating_map"
  | "composing"
  | "uploading"
  | "submitting"
  | "in_production"
  | "shipped"
  | "delivered"
  | "failed"
  | "cancelled";

// Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "";
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || "Orders";

const AIRTABLE_API_BASE = "https://api.airtable.com/v0";

/**
 * Make authenticated Airtable API request
 */
async function airtableRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${AIRTABLE_API_BASE}/${AIRTABLE_BASE_ID}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Map Airtable field names to our interface
 */
function mapRecordFromAirtable(record: any): OrderRecord {
  return {
    id: record.id,
    etsyReceiptId: record.fields["Etsy Receipt ID"] || "",
    status: record.fields["Status"] || "pending",
    customerName: record.fields["Customer Name"] || "",
    customerEmail: record.fields["Customer Email"] || "",
    shippingAddress: record.fields["Shipping Address"] || "",
    shippingCity: record.fields["Shipping City"] || "",
    shippingState: record.fields["Shipping State"] || "",
    shippingZip: record.fields["Shipping Zip"] || "",
    shippingCountry: record.fields["Shipping Country"] || "",
    mapAddress: record.fields["Map Address"] || "",
    customText: record.fields["Custom Text"] || "",
    latitude: record.fields["Latitude"],
    longitude: record.fields["Longitude"],
    printFileUrl: record.fields["Print File URL"],
    printifyOrderId: record.fields["Printify Order ID"],
    trackingNumber: record.fields["Tracking Number"],
    trackingCarrier: record.fields["Tracking Carrier"],
    trackingUrl: record.fields["Tracking URL"],
    errorMessage: record.fields["Error Message"],
    createdAt: record.fields["Created At"] || new Date().toISOString(),
    updatedAt: record.fields["Updated At"] || new Date().toISOString(),
    processedAt: record.fields["Processed At"],
    shippedAt: record.fields["Shipped At"],
  };
}

/**
 * Map our interface to Airtable field names
 */
function mapRecordToAirtable(
  order: Partial<OrderRecord>
): Record<string, any> {
  const fields: Record<string, any> = {};

  if (order.etsyReceiptId !== undefined)
    fields["Etsy Receipt ID"] = order.etsyReceiptId;
  if (order.status !== undefined) fields["Status"] = order.status;
  if (order.customerName !== undefined)
    fields["Customer Name"] = order.customerName;
  if (order.customerEmail !== undefined)
    fields["Customer Email"] = order.customerEmail;
  if (order.shippingAddress !== undefined)
    fields["Shipping Address"] = order.shippingAddress;
  if (order.shippingCity !== undefined)
    fields["Shipping City"] = order.shippingCity;
  if (order.shippingState !== undefined)
    fields["Shipping State"] = order.shippingState;
  if (order.shippingZip !== undefined)
    fields["Shipping Zip"] = order.shippingZip;
  if (order.shippingCountry !== undefined)
    fields["Shipping Country"] = order.shippingCountry;
  if (order.mapAddress !== undefined) fields["Map Address"] = order.mapAddress;
  if (order.customText !== undefined) fields["Custom Text"] = order.customText;
  if (order.latitude !== undefined) fields["Latitude"] = order.latitude;
  if (order.longitude !== undefined) fields["Longitude"] = order.longitude;
  if (order.printFileUrl !== undefined)
    fields["Print File URL"] = order.printFileUrl;
  if (order.printifyOrderId !== undefined)
    fields["Printify Order ID"] = order.printifyOrderId;
  if (order.trackingNumber !== undefined)
    fields["Tracking Number"] = order.trackingNumber;
  if (order.trackingCarrier !== undefined)
    fields["Tracking Carrier"] = order.trackingCarrier;
  if (order.trackingUrl !== undefined)
    fields["Tracking URL"] = order.trackingUrl;
  if (order.errorMessage !== undefined)
    fields["Error Message"] = order.errorMessage;
  if (order.processedAt !== undefined)
    fields["Processed At"] = order.processedAt;
  if (order.shippedAt !== undefined) fields["Shipped At"] = order.shippedAt;

  // Always update the Updated At field
  fields["Updated At"] = new Date().toISOString();

  return fields;
}

/**
 * Create a new order record
 */
export async function createOrder(
  order: Omit<OrderRecord, "id" | "createdAt" | "updatedAt">
): Promise<OrderRecord> {
  const now = new Date().toISOString();

  const response = await airtableRequest<{ records: any[] }>(
    `/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
    {
      method: "POST",
      body: JSON.stringify({
        records: [
          {
            fields: {
              ...mapRecordToAirtable(order),
              "Created At": now,
              "Updated At": now,
            },
          },
        ],
      }),
    }
  );

  return mapRecordFromAirtable(response.records[0]);
}

/**
 * Get order by ID
 */
export async function getOrder(recordId: string): Promise<OrderRecord | null> {
  try {
    const record = await airtableRequest<any>(
      `/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${recordId}`
    );
    return mapRecordFromAirtable(record);
  } catch (error) {
    return null;
  }
}

/**
 * Get order by Etsy Receipt ID
 */
export async function getOrderByEtsyId(
  etsyReceiptId: string
): Promise<OrderRecord | null> {
  const formula = `{Etsy Receipt ID} = '${etsyReceiptId}'`;

  const response = await airtableRequest<{ records: any[] }>(
    `/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}`
  );

  if (response.records.length === 0) {
    return null;
  }

  return mapRecordFromAirtable(response.records[0]);
}

/**
 * Update order
 */
export async function updateOrder(
  recordId: string,
  updates: Partial<OrderRecord>
): Promise<OrderRecord> {
  const response = await airtableRequest<any>(
    `/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${recordId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: mapRecordToAirtable(updates),
      }),
    }
  );

  return mapRecordFromAirtable(response);
}

/**
 * Get orders by status
 */
export async function getOrdersByStatus(
  status: OrderStatus
): Promise<OrderRecord[]> {
  const formula = `{Status} = '${status}'`;

  const response = await airtableRequest<{ records: any[] }>(
    `/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}&sort%5B0%5D%5Bfield%5D=Created%20At&sort%5B0%5D%5Bdirection%5D=asc`
  );

  return response.records.map(mapRecordFromAirtable);
}

/**
 * Get pending orders (ready for processing)
 */
export async function getPendingOrders(): Promise<OrderRecord[]> {
  return getOrdersByStatus("pending");
}

/**
 * Get failed orders
 */
export async function getFailedOrders(): Promise<OrderRecord[]> {
  return getOrdersByStatus("failed");
}

/**
 * Get all orders (paginated)
 */
export async function getAllOrders(options: {
  pageSize?: number;
  offset?: string;
}): Promise<{ records: OrderRecord[]; offset?: string }> {
  const params = new URLSearchParams();
  params.set("pageSize", (options.pageSize || 100).toString());
  if (options.offset) {
    params.set("offset", options.offset);
  }
  params.set("sort[0][field]", "Created At");
  params.set("sort[0][direction]", "desc");

  const response = await airtableRequest<{
    records: any[];
    offset?: string;
  }>(`/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?${params.toString()}`);

  return {
    records: response.records.map(mapRecordFromAirtable),
    offset: response.offset,
  };
}

/**
 * Get order statistics
 */
export async function getOrderStats(): Promise<{
  total: number;
  pending: number;
  inProduction: number;
  shipped: number;
  failed: number;
}> {
  const response = await airtableRequest<{ records: any[] }>(
    `/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?fields%5B%5D=Status`
  );

  const stats = {
    total: response.records.length,
    pending: 0,
    inProduction: 0,
    shipped: 0,
    failed: 0,
  };

  for (const record of response.records) {
    const status = record.fields.Status;
    if (status === "pending") stats.pending++;
    else if (status === "in_production") stats.inProduction++;
    else if (status === "shipped" || status === "delivered") stats.shipped++;
    else if (status === "failed") stats.failed++;
  }

  return stats;
}

/**
 * Mark order as failed
 */
export async function markOrderFailed(
  recordId: string,
  errorMessage: string
): Promise<OrderRecord> {
  return updateOrder(recordId, {
    status: "failed",
    errorMessage: errorMessage,
  });
}

/**
 * Mark order as shipped
 */
export async function markOrderShipped(
  recordId: string,
  tracking: {
    trackingNumber: string;
    trackingCarrier: string;
    trackingUrl?: string;
  }
): Promise<OrderRecord> {
  return updateOrder(recordId, {
    status: "shipped",
    trackingNumber: tracking.trackingNumber,
    trackingCarrier: tracking.trackingCarrier,
    trackingUrl: tracking.trackingUrl,
    shippedAt: new Date().toISOString(),
  });
}

/**
 * Check if order already exists (prevent duplicates)
 */
export async function orderExists(etsyReceiptId: string): Promise<boolean> {
  const order = await getOrderByEtsyId(etsyReceiptId);
  return order !== null;
}

/**
 * Get recent orders (for dashboard)
 */
export async function getRecentOrders(limit: number = 20): Promise<OrderRecord[]> {
  const params = new URLSearchParams();
  params.set("pageSize", limit.toString());
  params.set("sort[0][field]", "Created At");
  params.set("sort[0][direction]", "desc");

  const response = await airtableRequest<{ records: any[] }>(
    `/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?${params.toString()}`
  );

  return response.records.map(mapRecordFromAirtable);
}
