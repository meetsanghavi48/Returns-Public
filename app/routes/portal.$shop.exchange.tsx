import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import prisma from "../db.server";
import { shopifyREST } from "../services/shopify.server";
import { getCurrencySymbol } from "~/utils/currency";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const dataParam = url.searchParams.get("data");
  if (!dataParam) throw redirect(`/portal/${params.shop}`);

  const shopDomain = params.shop!;
  const shopRecord = await prisma.shop.findUnique({
    where: { shop: shopDomain },
  });

  let allProducts: any[] = [];
  if (shopRecord?.accessToken) {
    try {
      const result = await shopifyREST(
        shopDomain,
        shopRecord.accessToken,
        "GET",
        "products.json?limit=50&fields=id,title,images,variants,options",
      );
      allProducts = (result?.products || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        image: p.images?.[0]?.src || null,
        options: p.options || [],
        variants: (p.variants || []).map((v: any) => ({
          id: v.id,
          title: v.title,
          price: v.price,
          option1: v.option1,
          option2: v.option2,
          option3: v.option3,
          available: v.inventory_quantity > 0 || !v.inventory_management,
        })),
      }));
    } catch (e) {
      console.error("[Exchange] Failed to load products", e);
    }
  }

  try {
    const data = JSON.parse(decodeURIComponent(dataParam));
    return json({ data, shop: shopDomain, allProducts });
  } catch {
    throw redirect(`/portal/${params.shop}`);
  }
};

export default function PortalExchange() {
  const { data, shop, allProducts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const variantFetcher = useFetcher<any>();

  const exchangeItems = (data.selected_items || []).filter(
    (i: any) => i.action === "exchange",
  );
  const returnItems = (data.selected_items || []).filter(
    (i: any) => i.action === "return",
  );

  const [currentIdx, setCurrentIdx] = useState(0);
  const [tab, setTab] = useState<"same" | "different">("same");
  const [variants, setVariants] = useState<Record<string, any>>({});
  const [selectedOpts, setSelectedOpts] = useState<
    Record<string, Record<string, string>>
  >({});
  const [selectedVariant, setSelectedVariant] = useState<Record<string, any>>(
    {},
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDiffProduct, setSelectedDiffProduct] = useState<
    Record<string, any>
  >({});

  const currentItem = exchangeItems[currentIdx];

  // Fetch variants for current item's product
  useEffect(() => {
    if (currentItem && !variants[currentItem.product_id]) {
      variantFetcher.load(
        `/portal/${shop}/variants?product_id=${currentItem.product_id}`,
      );
    }
  }, [currentIdx, currentItem?.product_id]);

  useEffect(() => {
    if (variantFetcher.data?.product_id && variantFetcher.data?.variants) {
      setVariants((prev) => ({
        ...prev,
        [variantFetcher.data.product_id]: variantFetcher.data.variants,
      }));
    }
  }, [variantFetcher.data]);

  // Get product options for current item
  const currentProduct = allProducts.find(
    (p) => String(p.id) === String(currentItem?.product_id),
  );
  const productOptions = currentProduct?.options || [];
  const productVariants =
    variants[currentItem?.product_id] || currentProduct?.variants || [];

  // Handle option selection (size chip click)
  const selectOption = useCallback(
    (itemId: string, optName: string, value: string) => {
      setSelectedOpts((prev) => {
        const updated = {
          ...prev,
          [itemId]: { ...(prev[itemId] || {}), [optName]: value },
        };
        // Try to match a variant
        const opts = updated[itemId];
        const matched = productVariants.find((v: any) => {
          return productOptions.every((o: any, idx: number) => {
            const key = `option${idx + 1}`;
            return !opts[o.name] || v[key] === opts[o.name];
          });
        });
        if (matched) {
          setSelectedVariant((prev) => ({ ...prev, [itemId]: matched }));
        }
        return updated;
      });
    },
    [productVariants, productOptions],
  );

  // Handle different product selection
  const selectDifferentProduct = useCallback(
    (product: any) => {
      const itemId = currentItem?.id;
      if (!itemId) return;
      setSelectedDiffProduct((prev) => ({ ...prev, [itemId]: product }));
      setSelectedOpts((prev) => ({ ...prev, [itemId]: {} }));
      setSelectedVariant((prev) => {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      });
    },
    [currentItem],
  );

  // Handle different product variant option select
  const diffProduct = selectedDiffProduct[currentItem?.id];
  const diffProductOptions = diffProduct?.options || [];
  const diffProductVariants = diffProduct?.variants || [];

  const selectDiffOption = useCallback(
    (itemId: string, optName: string, value: string) => {
      setSelectedOpts((prev) => {
        const updated = {
          ...prev,
          [itemId]: { ...(prev[itemId] || {}), [optName]: value },
        };
        const opts = updated[itemId];
        const matched = diffProductVariants.find((v: any) => {
          return diffProductOptions.every((o: any, idx: number) => {
            const key = `option${idx + 1}`;
            return !opts[o.name] || v[key] === opts[o.name];
          });
        });
        if (matched) {
          setSelectedVariant((prev) => ({ ...prev, [itemId]: matched }));
        }
        return updated;
      });
    },
    [diffProductVariants, diffProductOptions],
  );

  const handleContinue = useCallback(() => {
    const itemId = currentItem?.id;
    const variant = selectedVariant[itemId];
    if (!variant) {
      alert("Please select a replacement variant.");
      return;
    }

    // Update the exchange item with selected variant
    exchangeItems[currentIdx] = {
      ...exchangeItems[currentIdx],
      exchange_variant_id: String(variant.id),
      exchange_variant_title: variant.title,
      exchange_product_title: diffProduct?.title || currentItem.title,
      price_diff: parseFloat(variant.price) - parseFloat(currentItem.price),
    };

    if (currentIdx < exchangeItems.length - 1) {
      // Move to next exchange item
      setCurrentIdx(currentIdx + 1);
      setTab("same");
      setSearchQuery("");
    } else {
      // All exchange items configured, go to confirm
      const allItems = [...returnItems, ...exchangeItems];
      const confirmData = encodeURIComponent(
        JSON.stringify({ ...data, selected_items: allItems }),
      );
      navigate(`/portal/${shop}/confirm?data=${confirmData}`);
    }
  }, [
    currentItem,
    selectedVariant,
    exchangeItems,
    returnItems,
    currentIdx,
    data,
    shop,
    navigate,
    diffProduct,
  ]);

  const handleBack = useCallback(() => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    } else {
      navigate(-1);
    }
  }, [currentIdx, navigate]);

  const filteredProducts = allProducts.filter(
    (p) =>
      String(p.id) !== String(currentItem?.product_id) &&
      p.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const currencyCode = data.currency || "USD";
  const cs = getCurrencySymbol(currencyCode);

  const hasVariantSelected = !!selectedVariant[currentItem?.id];

  if (!currentItem) {
    // No exchange items, skip to confirm
    const confirmData = encodeURIComponent(JSON.stringify(data));
    navigate(`/portal/${shop}/confirm?data=${confirmData}`);
    return null;
  }

  return (
    <>
      {/* Breadcrumb navigation */}
      <div className="portal-breadcrumbs">
        <span className="portal-breadcrumb done" onClick={() => navigate(`/portal/${shop}`)}>
          Find Order
        </span>
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb done" onClick={() => navigate(-1)}>
          Select Items
        </span>
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb active">Exchange</span>
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb">Confirm</span>
      </div>

      <p
        style={{
          textAlign: "center",
          fontSize: 14,
          color: "var(--portal-text-muted)",
          margin: "0 0 12px",
        }}
      >
        Item {currentIdx + 1} of {exchangeItems.length} &mdash; Exchange
      </p>

      {/* Current item info */}
      <div className="portal-card">
        <div className="portal-item" style={{ cursor: "default" }}>
          {currentItem.image_url && (
            <img
              className="portal-item-image"
              src={currentItem.image_url}
              alt={currentItem.title}
            />
          )}
          <div className="portal-item-info">
            <div className="portal-item-title">{currentItem.title}</div>
            <div className="portal-item-meta">
              Exchanging {currentItem.variant_title || "Default"}
            </div>
          </div>
        </div>

        {/* Same / Different toggle */}
        <div className="portal-toggle-group" style={{ marginTop: 12 }}>
          <button
            className={`portal-toggle ${tab === "same" ? "active" : ""}`}
            onClick={() => {
              setTab("same");
              setSelectedVariant((prev) => {
                const { [currentItem.id]: _, ...rest } = prev;
                return rest;
              });
              setSelectedOpts((prev) => ({
                ...prev,
                [currentItem.id]: {},
              }));
            }}
            type="button"
          >
            Same Product
          </button>
          <button
            className={`portal-toggle ${tab === "different" ? "active" : ""}`}
            onClick={() => {
              setTab("different");
              setSelectedVariant((prev) => {
                const { [currentItem.id]: _, ...rest } = prev;
                return rest;
              });
              setSelectedOpts((prev) => ({
                ...prev,
                [currentItem.id]: {},
              }));
            }}
            type="button"
          >
            Different Product
          </button>
        </div>

        {/* Same Product — size/variant chips */}
        {tab === "same" && (
          <div style={{ marginTop: 16 }}>
            {productOptions.map((opt: any, optIdx: number) => (
              <div key={opt.name} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    color: "var(--portal-text-muted)",
                    marginBottom: 6,
                  }}
                >
                  {opt.name}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    ...new Set(
                      productVariants.map(
                        (v: any) => v[`option${optIdx + 1}`],
                      ),
                    ),
                  ]
                    .filter(Boolean)
                    .map((val: any) => {
                      const isCurrentVariant =
                        currentItem.variant_title?.includes(val);
                      const isSelected =
                        selectedOpts[currentItem.id]?.[opt.name] === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() =>
                            selectOption(currentItem.id, opt.name, val)
                          }
                          style={{
                            padding: "8px 16px",
                            border: isSelected
                              ? "2px solid var(--portal-accent)"
                              : "1px solid var(--portal-border)",
                            borderRadius: 8,
                            background: isSelected
                              ? "var(--portal-accent)"
                              : "white",
                            color: isSelected ? "white" : "var(--portal-text)",
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: isCurrentVariant ? "not-allowed" : "pointer",
                            opacity: isCurrentVariant ? 0.4 : 1,
                          }}
                          disabled={isCurrentVariant}
                        >
                          {val}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}

            {/* Show selected variant confirmation */}
            {selectedVariant[currentItem.id] && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: "#f0faf0",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <strong>Selected:</strong>{" "}
                {selectedVariant[currentItem.id].title} — {cs}
                {selectedVariant[currentItem.id].price}
                {parseFloat(selectedVariant[currentItem.id].price) !==
                  parseFloat(currentItem.price) && (
                  <span
                    style={{
                      color:
                        parseFloat(selectedVariant[currentItem.id].price) >
                        parseFloat(currentItem.price)
                          ? "#c00"
                          : "var(--portal-success)",
                      marginLeft: 8,
                    }}
                  >
                    (
                    {parseFloat(selectedVariant[currentItem.id].price) >
                    parseFloat(currentItem.price)
                      ? "+"
                      : ""}
                    {cs}
                    {(
                      parseFloat(selectedVariant[currentItem.id].price) -
                      parseFloat(currentItem.price)
                    ).toFixed(2)}
                    )
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Different Product — product grid */}
        {tab === "different" && (
          <div style={{ marginTop: 16 }}>
            {!diffProduct ? (
              <>
                <input
                  type="text"
                  className="portal-input"
                  placeholder="🔍 Filter products by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ marginBottom: 12 }}
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    maxHeight: 400,
                    overflowY: "auto",
                  }}
                >
                  {filteredProducts.map((product: any) => (
                    <div
                      key={product.id}
                      onClick={() => selectDifferentProduct(product)}
                      style={{
                        cursor: "pointer",
                        border: "1px solid var(--portal-border)",
                        borderRadius: 10,
                        overflow: "hidden",
                        background: "white",
                      }}
                    >
                      {product.image && (
                        <img
                          src={product.image}
                          alt={product.title}
                          style={{
                            width: "100%",
                            height: 160,
                            objectFit: "cover",
                          }}
                        />
                      )}
                      <div style={{ padding: 8 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            lineHeight: 1.3,
                          }}
                        >
                          {product.title}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--portal-accent)",
                            fontWeight: 600,
                            marginTop: 4,
                          }}
                        >
                          {cs}{product.variants?.[0]?.price || "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredProducts.length === 0 && (
                    <p
                      style={{
                        gridColumn: "1 / -1",
                        textAlign: "center",
                        color: "var(--portal-text-muted)",
                        fontSize: 14,
                      }}
                    >
                      No products found.
                    </p>
                  )}
                </div>
              </>
            ) : (
              /* Selected different product — show variant chips */
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDiffProduct((prev) => {
                        const { [currentItem.id]: _, ...rest } = prev;
                        return rest;
                      });
                      setSelectedVariant((prev) => {
                        const { [currentItem.id]: _, ...rest } = prev;
                        return rest;
                      });
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 16,
                    }}
                  >
                    ←
                  </button>
                  <strong>{diffProduct.title}</strong>
                </div>

                {diffProductOptions.map((opt: any, optIdx: number) => (
                  <div key={opt.name} style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        color: "var(--portal-text-muted)",
                        marginBottom: 6,
                      }}
                    >
                      {opt.name}
                    </div>
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                    >
                      {[
                        ...new Set(
                          diffProductVariants.map(
                            (v: any) => v[`option${optIdx + 1}`],
                          ),
                        ),
                      ]
                        .filter(Boolean)
                        .map((val: any) => {
                          const isSelected =
                            selectedOpts[currentItem.id]?.[opt.name] === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() =>
                                selectDiffOption(currentItem.id, opt.name, val)
                              }
                              style={{
                                padding: "8px 16px",
                                border: isSelected
                                  ? "2px solid var(--portal-accent)"
                                  : "1px solid var(--portal-border)",
                                borderRadius: 8,
                                background: isSelected
                                  ? "var(--portal-accent)"
                                  : "white",
                                color: isSelected
                                  ? "white"
                                  : "var(--portal-text)",
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: "pointer",
                              }}
                            >
                              {val}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}

                {selectedVariant[currentItem.id] && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      background: "#f0faf0",
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                  >
                    <strong>Selected:</strong>{" "}
                    {selectedVariant[currentItem.id].title} — {cs}
                    {selectedVariant[currentItem.id].price}
                    {parseFloat(selectedVariant[currentItem.id].price) !==
                      parseFloat(currentItem.price) && (
                      <span
                        style={{
                          color:
                            parseFloat(selectedVariant[currentItem.id].price) >
                            parseFloat(currentItem.price)
                              ? "#c00"
                              : "var(--portal-success)",
                          marginLeft: 8,
                        }}
                      >
                        (
                        {parseFloat(selectedVariant[currentItem.id].price) >
                        parseFloat(currentItem.price)
                          ? "+"
                          : ""}
                        {cs}
                        {(
                          parseFloat(selectedVariant[currentItem.id].price) -
                          parseFloat(currentItem.price)
                        ).toFixed(2)}
                        )
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button
          className="portal-btn"
          onClick={handleBack}
          type="button"
          style={{ flex: 1 }}
        >
          ← Back
        </button>
        <button
          className="portal-btn portal-btn-primary"
          onClick={handleContinue}
          disabled={!hasVariantSelected}
          type="button"
          style={{ flex: 2, opacity: hasVariantSelected ? 1 : 0.5 }}
        >
          Continue →
        </button>
      </div>
    </>
  );
}
