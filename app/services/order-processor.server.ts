/**
 * Order Processor
 *
 * Main orchestration logic that processes orders through the pipeline:
 * 1. Parse order customization
 * 2. Geocode address
 * 3. Generate map artwork
 * 4. Upload to storage
 * 5. Submit to Printify
 * 6. Update order status
 */

import * as airtable from "./airtable.server";
import * as printify from "./printify.server";
import * as etsy from "./etsy.server";
import {
  generateGlassArtwork,
  downloadArtworkFile,
  geocodeAddress,
} from "./map-etcher.server";

// Storage configuration (using Cloudflare R2 or similar)
const STORAGE_BUCKET_URL = process.env.STORAGE_BUCKET_URL || "";
const STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY || "";
const STORAGE_SECRET_KEY = process.env.STORAGE_SECRET_KEY || "";

// Printify variant ID for 16oz glass (looked up from catalog)
const GLASS_VARIANT_ID = parseInt(process.env.PRINTIFY_GLASS_VARIANT_ID || "0");

export interface ProcessingResult {
  success: boolean;
  orderId: string;
  error?: string;
  printifyOrderId?: string;
}

/**
 * Process a single order through the entire pipeline
 */
export async function processOrder(
  orderId: string
): Promise<ProcessingResult> {
  let order = await airtable.getOrder(orderId);

  if (!order) {
    return { success: false, orderId, error: "Order not found" };
  }

  try {
    // Step 1: Geocode the address
    await airtable.updateOrder(orderId, { status: "geocoding" });

    const geoResult = await geocodeAddress(order.mapAddress);

    await airtable.updateOrder(orderId, {
      latitude: geoResult.lat,
      longitude: geoResult.lng,
    });

    // Step 2: Generate map artwork
    await airtable.updateOrder(orderId, { status: "generating_map" });

    const artworkResult = await generateGlassArtwork({
      lat: geoResult.lat,
      lng: geoResult.lng,
      text: order.customText || undefined,
      glass_size: "16oz",
    });

    // Step 3: Compose and prepare print file
    await airtable.updateOrder(orderId, { status: "composing" });

    // Download the PNG file
    const pngBuffer = await downloadArtworkFile(artworkResult.png_url);

    // Step 4: Upload to storage
    await airtable.updateOrder(orderId, { status: "uploading" });

    const printFileUrl = await uploadToStorage(
      pngBuffer,
      `orders/${orderId}/print.png`
    );

    await airtable.updateOrder(orderId, { printFileUrl });

    // Step 5: Submit to Printify
    await airtable.updateOrder(orderId, { status: "submitting" });

    // Parse customer name
    const nameParts = order.customerName.split(" ");
    const firstName = nameParts[0] || "Customer";
    const lastName = nameParts.slice(1).join(" ") || "";

    const printifyResult = await printify.submitFullOrder({
      externalId: order.etsyReceiptId,
      imageUrl: printFileUrl,
      variantId: GLASS_VARIANT_ID,
      quantity: 1,
      shippingAddress: {
        firstName,
        lastName,
        email: order.customerEmail,
        address1: order.shippingAddress,
        city: order.shippingCity,
        state: order.shippingState,
        country: order.shippingCountry,
        zip: order.shippingZip,
      },
    });

    // Step 6: Update order as in production
    await airtable.updateOrder(orderId, {
      status: "in_production",
      printifyOrderId: printifyResult.orderId,
      processedAt: new Date().toISOString(),
    });

    return {
      success: true,
      orderId,
      printifyOrderId: printifyResult.orderId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await airtable.markOrderFailed(orderId, errorMessage);

    return {
      success: false,
      orderId,
      error: errorMessage,
    };
  }
}

/**
 * Process all pending orders
 */
export async function processAllPendingOrders(): Promise<ProcessingResult[]> {
  const pendingOrders = await airtable.getPendingOrders();
  const results: ProcessingResult[] = [];

  for (const order of pendingOrders) {
    if (order.id) {
      const result = await processOrder(order.id);
      results.push(result);

      // Add small delay between orders to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Retry a failed order
 */
export async function retryFailedOrder(
  orderId: string
): Promise<ProcessingResult> {
  // Reset status to pending
  await airtable.updateOrder(orderId, {
    status: "pending",
    errorMessage: undefined,
  });

  return processOrder(orderId);
}

/**
 * Handle Printify shipment webhook
 */
export async function handlePrintifyShipment(
  externalId: string,
  shipment: {
    carrier: string;
    trackingNumber: string;
    trackingUrl?: string;
  }
): Promise<void> {
  // Find order by Etsy Receipt ID
  const order = await airtable.getOrderByEtsyId(externalId);

  if (!order || !order.id) {
    console.error(`Order not found for external ID: ${externalId}`);
    return;
  }

  // Update order with tracking
  await airtable.markOrderShipped(order.id, {
    trackingNumber: shipment.trackingNumber,
    trackingCarrier: shipment.carrier,
    trackingUrl: shipment.trackingUrl,
  });
}

/**
 * Sync Etsy order status with tracking
 * Call this after receiving Printify shipment webhook
 */
export async function syncEtsyTracking(
  orderId: string,
  etsyTokens: etsy.EtsyTokens
): Promise<void> {
  const order = await airtable.getOrder(orderId);

  if (!order || !order.trackingNumber || !order.trackingCarrier) {
    return;
  }

  const receiptId = parseInt(order.etsyReceiptId);

  await etsy.addReceiptTracking(
    etsyTokens.access_token,
    receiptId,
    order.trackingNumber,
    etsy.normalizeCarrierName(order.trackingCarrier)
  );
}

/**
 * Import new orders from Etsy
 */
export async function importEtsyOrders(
  etsyTokens: etsy.EtsyTokens,
  sinceTimestamp: number
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const results = { imported: 0, skipped: 0, errors: [] as string[] };

  const newOrders = await etsy.getNewOrders(
    etsyTokens.access_token,
    sinceTimestamp
  );

  for (const receipt of newOrders) {
    try {
      // Check if already imported
      const exists = await airtable.orderExists(receipt.receipt_id.toString());
      if (exists) {
        results.skipped++;
        continue;
      }

      // Parse personalization
      const customization = etsy.parsePersonalization(receipt);

      if (!customization) {
        results.errors.push(
          `Receipt ${receipt.receipt_id}: Could not parse customization`
        );
        continue;
      }

      // Create order in Airtable
      await airtable.createOrder({
        etsyReceiptId: receipt.receipt_id.toString(),
        status: "pending",
        customerName: receipt.name,
        customerEmail: receipt.buyer_email || "",
        shippingAddress: receipt.first_line,
        shippingCity: receipt.city,
        shippingState: receipt.state,
        shippingZip: receipt.zip,
        shippingCountry: receipt.country_iso,
        mapAddress: customization.fullAddress,
        customText: customization.customText || "",
      });

      results.imported++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      results.errors.push(`Receipt ${receipt.receipt_id}: ${errorMessage}`);
    }
  }

  return results;
}

/**
 * Upload file to cloud storage
 * This is a placeholder - implement based on your storage provider
 */
async function uploadToStorage(
  buffer: Buffer,
  key: string
): Promise<string> {
  // Cloudflare R2 implementation
  if (STORAGE_BUCKET_URL && STORAGE_ACCESS_KEY) {
    const url = `${STORAGE_BUCKET_URL}/${key}`;

    // For R2, you'd use AWS SDK with custom endpoint
    // This is a simplified example
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        // Add auth headers based on your storage provider
      },
      body: buffer,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload to storage: ${response.status}`);
    }

    return url;
  }

  // Fallback: Return local path or throw
  throw new Error("Storage not configured");
}

/**
 * Main polling function - call this on a schedule (e.g., every 5 minutes)
 */
export async function runPollingCycle(
  etsyTokens: etsy.EtsyTokens,
  lastPollTimestamp: number
): Promise<{
  ordersImported: number;
  ordersProcessed: number;
  errors: string[];
}> {
  const errors: string[] = [];

  // 1. Import new orders from Etsy
  const importResult = await importEtsyOrders(etsyTokens, lastPollTimestamp);
  errors.push(...importResult.errors);

  // 2. Process pending orders
  const processResults = await processAllPendingOrders();
  const processErrors = processResults
    .filter((r) => !r.success)
    .map((r) => `Order ${r.orderId}: ${r.error}`);
  errors.push(...processErrors);

  return {
    ordersImported: importResult.imported,
    ordersProcessed: processResults.filter((r) => r.success).length,
    errors,
  };
}
