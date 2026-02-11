/**
 * Printify Webhook Handler
 *
 * Receives shipment notifications from Printify and updates order status.
 *
 * Webhook URL to configure in Printify:
 * https://your-domain.com/api/webhooks/printify
 */

import { json, type ActionFunction } from "@remix-run/node";
import {
  parseWebhookPayload,
  isValidWebhookPayload,
} from "~/services/printify.server";
import { handlePrintifyShipment } from "~/services/order-processor.server";

// Secret token for basic webhook verification
// Set this in Printify webhook URL as query param: ?token=YOUR_SECRET
const WEBHOOK_SECRET = process.env.PRINTIFY_WEBHOOK_SECRET || "";

export const action: ActionFunction = async ({ request }) => {
  // Only accept POST
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Basic token verification via query param
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) {
    console.error("Printify webhook: Invalid token");
    return json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const body = await request.text();
    const payload = parseWebhookPayload(body);

    if (!isValidWebhookPayload(payload)) {
      console.error("Printify webhook: Invalid payload structure");
      return json({ error: "Invalid payload" }, { status: 400 });
    }

    console.log(`Printify webhook received: ${payload.type}`, {
      id: payload.resource?.id,
      externalId: payload.resource?.external_id,
    });

    // Handle different webhook types
    switch (payload.type) {
      case "order:shipment:created":
        // Order has been shipped
        if (payload.resource.shipments && payload.resource.shipments.length > 0) {
          const shipment = payload.resource.shipments[0];
          await handlePrintifyShipment(payload.resource.external_id, {
            carrier: shipment.carrier,
            trackingNumber: shipment.number,
            trackingUrl: shipment.url,
          });
        }
        break;

      case "order:shipment:delivered":
        // Order has been delivered - could update status if tracking
        console.log(
          `Order delivered: ${payload.resource.external_id}`
        );
        break;

      case "order:created":
        console.log(`Order created in Printify: ${payload.resource.id}`);
        break;

      case "order:sent-to-production":
        console.log(`Order sent to production: ${payload.resource.id}`);
        break;

      default:
        console.log(`Unhandled webhook type: ${payload.type}`);
    }

    return json({ received: true });
  } catch (error) {
    console.error("Printify webhook error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
};

// GET endpoint for webhook verification (some services ping this)
export const loader = () => {
  return json({ status: "Printify webhook endpoint active" });
};
