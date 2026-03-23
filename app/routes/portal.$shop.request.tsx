import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";

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
  const variantFetcher = useFetcher<any>();

  const [selectedItems, setSelectedItems] = useState<
    Record<
      string,
      {
        action: string;
        reason: string;
        qty: number;
        exchange_variant_id?: string;
        exchange_variant_title?: string;
      }
    >
  >({});
  const [variants, setVariants] = useState<Record<string, any[]>>({});
  const [loadingVariants, setLoadingVariants] = useState<Record<string, boolean>>({});

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

  // Fetch variants when user selects "Exchange"
  const fetchVariants = useCallback(
    (itemId: string, productId: string) => {
      if (variants[productId] || loadingVariants[productId]) return;
      setLoadingVariants((prev) => ({ ...prev, [productId]: true }));
      variantFetcher.load(
        `/portal/${shop}/variants?product_id=${productId}`,
      );
    },
    [variants, loadingVariants, shop, variantFetcher],
  );

  // Handle variant fetcher response
  useEffect(() => {
    if (variantFetcher.data && variantFetcher.state === "idle") {
      const { product_id, variants: fetchedVariants } = variantFetcher.data;
      if (product_id && fetchedVariants) {
        setVariants((prev) => ({ ...prev, [product_id]: fetchedVariants }));
        setLoadingVariants((prev) => ({ ...prev, [product_id]: false }));
      }
    }
  }, [variantFetcher.data, variantFetcher.state]);

  const handleActionChange = useCallback(
    (itemId: string, action: string, productId: string) => {
      updateItem(itemId, "action", action);
      if (action === "exchange") {
        // Clear previous exchange variant selection
        setSelectedItems((prev) => ({
          ...prev,
          [itemId]: {
            ...prev[itemId],
            action: "exchange",
            exchange_variant_id: undefined,
            exchange_variant_title: undefined,
          },
        }));
        fetchVariants(itemId, productId);
      }
    },
    [updateItem, fetchVariants],
  );

  const handleNext = useCallback(() => {
    const items = order.line_items
      .filter((li: any) => selectedItems[li.id])
      .map((li: any) => ({
        ...li,
        ...selectedItems[li.id],
      }));

    if (items.length === 0) return;

    // Validate: exchange items must have a variant selected
    const missingVariant = items.find(
      (i: any) => i.action === "exchange" && !i.exchange_variant_id,
    );
    if (missingVariant) {
      alert("Please select a replacement variant for all exchange items.");
      return;
    }

    const confirmData = encodeURIComponent(
      JSON.stringify({ ...order, selected_items: items }),
    );
    navigate(`/portal/${shop}/confirm?data=${confirmData}`);
  }, [order, selectedItems, shop, navigate]);

  const selectedCount = Object.keys(selectedItems).length;

  return (
    <>
      <div className="portal-steps">
        <div className="portal-step done" />
        <div className="portal-step active" />
        <div className="portal-step" />
        <div className="portal-step" />
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
          const productVariants = variants[item.product_id] || [];
          const isLoadingVariants = loadingVariants[item.product_id];

          return (
            <div key={item.id}>
              <div
                className="portal-item"
                onClick={() => toggleItem(item.id)}
                style={{ cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  className="portal-item-checkbox"
                  checked={!!sel}
                  onChange={() => toggleItem(item.id)}
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
                </div>
                <div className="portal-item-price">₹{item.price}</div>
              </div>

              {sel && (
                <div style={{ padding: "8px 0 12px 32px" }}>
                  <div className="portal-toggle-group">
                    <button
                      className={`portal-toggle ${sel.action === "return" ? "active" : ""}`}
                      onClick={() =>
                        handleActionChange(item.id, "return", item.product_id)
                      }
                      type="button"
                    >
                      Return
                    </button>
                    <button
                      className={`portal-toggle ${sel.action === "exchange" ? "active" : ""}`}
                      onClick={() =>
                        handleActionChange(item.id, "exchange", item.product_id)
                      }
                      type="button"
                    >
                      Exchange
                    </button>
                  </div>

                  {/* Exchange variant selector */}
                  {sel.action === "exchange" && (
                    <div className="portal-field" style={{ marginTop: 8 }}>
                      <label className="portal-label">
                        Select replacement variant
                      </label>
                      {isLoadingVariants ? (
                        <p
                          style={{
                            fontSize: 13,
                            color: "var(--portal-text-muted)",
                          }}
                        >
                          Loading variants...
                        </p>
                      ) : productVariants.length > 0 ? (
                        <select
                          className="portal-select"
                          value={sel.exchange_variant_id || ""}
                          onChange={(e) => {
                            const v = productVariants.find(
                              (pv: any) =>
                                String(pv.id) === e.target.value,
                            );
                            setSelectedItems((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
                                exchange_variant_id: e.target.value,
                                exchange_variant_title: v?.title || "",
                              },
                            }));
                          }}
                        >
                          <option value="">Choose a variant...</option>
                          {productVariants
                            .filter(
                              (v: any) =>
                                String(v.id) !== String(item.variant_id),
                            )
                            .map((v: any) => (
                              <option key={v.id} value={String(v.id)}>
                                {v.title} — ₹{v.price}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <p
                          style={{
                            fontSize: 13,
                            color: "var(--portal-text-muted)",
                          }}
                        >
                          No other variants available for exchange.
                        </p>
                      )}
                    </div>
                  )}

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
