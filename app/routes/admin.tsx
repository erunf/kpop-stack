/**
 * Admin Dashboard
 *
 * Provides overview of the Map Memory Merchandise automation system:
 * - Etsy connection status
 * - Order statistics
 * - Recent orders table
 * - Manual controls for polling and processing
 */

import { json, type LoaderFunction, type ActionFunction } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import { hasEtsyConnection, getEtsyTokens } from "~/sessions.server";
import {
  getOrdersByStatus,
  getRecentOrders,
  type OrderRecord,
  type OrderStatus,
} from "~/services/airtable.server";
import { runPollingCycle, processAllPendingOrders } from "~/services/order-processor.server";

interface LoaderData {
  etsyConnected: boolean;
  stats: {
    pending: number;
    processing: number;
    inProduction: number;
    shipped: number;
    failed: number;
    total: number;
  };
  recentOrders: OrderRecord[];
  lastPoll: string | null;
  error?: string;
}

export const loader: LoaderFunction = async ({ request }) => {
  const etsyConnected = await hasEtsyConnection(request);

  let stats = {
    pending: 0,
    processing: 0,
    inProduction: 0,
    shipped: 0,
    failed: 0,
    total: 0,
  };

  let recentOrders: OrderRecord[] = [];
  let error: string | undefined;

  try {
    // Fetch order counts by status
    const [pending, geocoding, generating, composing, uploading, submitting, production, shipped, failed] =
      await Promise.all([
        getOrdersByStatus("pending"),
        getOrdersByStatus("geocoding"),
        getOrdersByStatus("generating_map"),
        getOrdersByStatus("composing"),
        getOrdersByStatus("uploading"),
        getOrdersByStatus("submitting"),
        getOrdersByStatus("in_production"),
        getOrdersByStatus("shipped"),
        getOrdersByStatus("failed"),
      ]);

    stats = {
      pending: pending.length,
      processing:
        geocoding.length +
        generating.length +
        composing.length +
        uploading.length +
        submitting.length,
      inProduction: production.length,
      shipped: shipped.length,
      failed: failed.length,
      total:
        pending.length +
        geocoding.length +
        generating.length +
        composing.length +
        uploading.length +
        submitting.length +
        production.length +
        shipped.length +
        failed.length,
    };

    // Get recent orders
    recentOrders = await getRecentOrders(20);
  } catch (err) {
    console.error("Failed to fetch order stats:", err);
    error = "Failed to connect to Airtable. Check your API key configuration.";
  }

  return json<LoaderData>({
    etsyConnected,
    stats,
    recentOrders,
    lastPoll: null, // Would be stored in a KV store in production
    error,
  });
};

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const action = formData.get("action");

  const tokens = await getEtsyTokens(request);

  if (action === "poll" && tokens) {
    try {
      const result = await runPollingCycle(
        { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        undefined
      );
      return json({ success: true, result });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Polling failed",
      });
    }
  }

  if (action === "process") {
    try {
      const results = await processAllPendingOrders();
      return json({ success: true, processed: results.length });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Processing failed",
      });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function AdminDashboard() {
  const { etsyConnected, stats, recentOrders, error } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();

  const isPolling = fetcher.state !== "idle" && fetcher.formData?.get("action") === "poll";
  const isProcessing = fetcher.state !== "idle" && fetcher.formData?.get("action") === "process";

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Map Memory Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Automated merchandise order processing status
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Connection Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Connection Status</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  etsyConnected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="font-medium">Etsy</span>
              {!etsyConnected && (
                <Link
                  to="/auth/etsy"
                  className="ml-2 text-sm text-blue-600 hover:underline"
                >
                  Connect
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  process.env.PRINTIFY_API_TOKEN ? "bg-green-500" : "bg-yellow-500"
                }`}
              />
              <span className="font-medium">Printify</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  process.env.AIRTABLE_API_KEY ? "bg-green-500" : "bg-yellow-500"
                }`}
              />
              <span className="font-medium">Airtable</span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Processing</p>
            <p className="text-2xl font-bold text-blue-600">{stats.processing}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">In Production</p>
            <p className="text-2xl font-bold text-purple-600">{stats.inProduction}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Shipped</p>
            <p className="text-2xl font-bold text-green-600">{stats.shipped}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Failed</p>
            <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Manual Actions</h2>
          <div className="flex gap-4">
            <fetcher.Form method="post">
              <input type="hidden" name="action" value="poll" />
              <button
                type="submit"
                disabled={!etsyConnected || isPolling}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPolling ? "Polling..." : "Poll Etsy Orders"}
              </button>
            </fetcher.Form>
            <fetcher.Form method="post">
              <input type="hidden" name="action" value="process" />
              <button
                type="submit"
                disabled={stats.pending === 0 || isProcessing}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? "Processing..." : `Process Pending (${stats.pending})`}
              </button>
            </fetcher.Form>
          </div>
          {fetcher.data && (
            <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
              <pre>{JSON.stringify(fetcher.data, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Recent Orders Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">Recent Orders</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No orders yet. Connect Etsy and poll for orders to get started.
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {order.etsyReceiptId?.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.mapAddress?.slice(0, 30)}
                        {(order.mapAddress?.length ?? 0) > 30 ? "..." : ""}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.customText || "Map Glass"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString()
                          : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Setup Guide Link */}
        <div className="mt-8 text-center">
          <p className="text-gray-600">
            Need help setting up?{" "}
            <a
              href="/docs/SETUP_GUIDE.md"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              View the Setup Guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const colors: Record<OrderStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    geocoding: "bg-blue-100 text-blue-800",
    generating_map: "bg-blue-100 text-blue-800",
    composing: "bg-blue-100 text-blue-800",
    uploading: "bg-blue-100 text-blue-800",
    submitting: "bg-blue-100 text-blue-800",
    in_production: "bg-purple-100 text-purple-800",
    shipped: "bg-green-100 text-green-800",
    delivered: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
        colors[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
