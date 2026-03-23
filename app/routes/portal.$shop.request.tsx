import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState, useCallback } from "react";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const orderParam = url.searchParams.get("order");
  if (!orderParam) throw redirect(`/portal/${params.shop}`);

  try {
    const order = JSON.parse(decodeURIComponent(orderParam));
    return json({ order, shop: params.shop });
  } catch {
    throw redirect(`/portal/${params.shop}`);
  }
};

export default function PortalRequest() {
  const { order, shop } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const returnedItemIds: string[] = order.returned_item_ids || [];

  const [selectedItems, setSelectedItems] = useState<
    Record<string, { action: string; reason: string; qty: number }>
  >({});

  const toggleItem = useCallback((itemId: string) => {
    setSelectedItems((prev) => {
      if (prev[itemId]) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { action: "return", reason: "", qty: 1 } };
    });
  }, []);

  const updateItem = useCallback(
    (itemId: string, field: string, value: string | number) => {
      setSelectedItems((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], [field]: value },
      }));
    },
    [],
  );

  const handleNext = useCallback(() => {
    const items = order.line_items
      .filter((li: any) => selectedItems[li.id])
      .map((li: any) => ({
        ...li,
        ...selectedItems[li.id],
      }));

    if (items.length === 0) return;

    const hasExchange = items.some((i: any) => i.action === "exchange");
    const confirmData = encodeURIComponent(
      JSON.stringify({ ...order, selected_items: items }),
    );

    if (hasExchange) {
      // Route through exchange page for variant selection
      navigate(`/portal/${shop}/exchange?data=${confirmData}`);
    } else {
      // No exchanges, go straight to confirm
      navigate(`/portal/${shop}/confirm?data=${confirmData}`);
    }
  }, [order, selectedItems, shop, navigate]);

  const selectedCount = Object.keys(selectedItems).length;

  return (
    <>
      {/* Breadcrumb navigation */}
      <div className="portal-breadcrumbs">
        <span className="portal-breadcrumb done" onClick={() => navigate(`/portal/${shop}`)}>
          Find Order
        </span>
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb active">Select Items</span>
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb">Confirm</span>
      </div>

      <div className="portal-card">
        <h2>Select Items</h2>
        <p
          style={{
            color: "var(--portal-text-muted)",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          Order {order.name} &mdash; Select items you want to return or
          exchange.
        </p>

        {order.line_items.map((item: any) => {
          const sel = selectedItems[item.id];
          const alreadyReturned = returnedItemIds.includes(String(item.id));
          return (
            <div key={item.id}>
              <div
                className="portal-item"
                onClick={() => !alreadyReturned && toggleItem(item.id)}
                style={{
                  cursor: alreadyReturned ? "not-allowed" : "pointer",
                  opacity: alreadyReturned ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  className="portal-item-checkbox"
                  checked={!!sel}
                  disabled={alreadyReturned}
                  onChange={() => !alreadyReturned && toggleItem(item.id)}
                />
                {item.image_url && (
                  <img
                    className="portal-item-image"
                    src={item.image_url}
                    alt={item.title}
                  />
                )}
                <div className="portal-item-info">
                  <div className="portal-item-title">{item.title}</div>
                  <div className="portal-item-meta">
                    {item.variant_title || ""} &middot; Qty: {item.quantity}
                  </div>
                  {alreadyReturned && (
                    <div style={{ fontSize: 12, color: "var(--portal-accent)", fontWeight: 600, marginTop: 2 }}>
                      Already in a return request
                    </div>
                  )}
                </div>
                <div className="portal-item-price">₹{item.price}</div>
              </div>

              {sel && (
                <div style={{ padding: "8px 0 12px 32px" }}>
                  <div className="portal-toggle-group">
                    <button
                      className={`portal-toggle ${sel.action === "exchange" ? "active" : ""}`}
                      onClick={() => updateItem(item.id, "action", "exchange")}
                      type="button"
                    >
                      Exchange
                    </button>
                    <button
                      className={`portal-toggle ${sel.action === "return" ? "active" : ""}`}
                      onClick={() => updateItem(item.id, "action", "return")}
                      type="button"
                    >
                      Return
                    </button>
                  </div>

                  <div className="portal-field" style={{ marginTop: 8 }}>
                    <select
                      className="portal-select"
                      value={sel.reason}
                      onChange={(e) =>
                        updateItem(item.id, "reason", e.target.value)
                      }
                    >
                      <option value="">Select a reason...</option>
                      <option value="Size too small">Size too small</option>
                      <option value="Size too large">Size too large</option>
                      <option value="Defective/damaged">
                        Defective/damaged
                      </option>
                      <option value="Wrong item received">
                        Wrong item received
                      </option>
                      <option value="Not as described">
                        Not as described
                      </option>
                      <option value="Changed my mind">Changed my mind</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {item.quantity > 1 && (
                    <div className="portal-field">
                      <label className="portal-label">
                        Quantity to return
                      </label>
                      <select
                        className="portal-select"
                        value={sel.qty}
                        onChange={(e) =>
                          updateItem(item.id, "qty", parseInt(e.target.value))
                        }
                      >
                        {Array.from({ length: item.quantity }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="portal-btn portal-btn-primary"
        onClick={handleNext}
        disabled={selectedCount === 0}
      >
        Continue with {selectedCount} item{selectedCount !== 1 ? "s" : ""}
      </button>
    </>
  );
}
