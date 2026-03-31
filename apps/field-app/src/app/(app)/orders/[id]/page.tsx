'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ProductVariant {
  id: string;
  shopifyVariantId: string;
  title: string;
  sku: string | null;
  priceCents: number;
  available: boolean;
  inventoryQuantity: number | null;
}

interface Product {
  id: string;
  shopifyProductId: string;
  title: string;
  imageUrl: string | null;
  variants: ProductVariant[];
}

interface OrderLineItem {
  id: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  shopifyOrderId: string | null;
  shopifyOrderNumber: string | null;
  companyId: string;
  companyName: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  status: string;
  paymentTerms: string;
  note: string | null;
  poNumber: string | null;
  placedAt: string | null;
  createdAt: string;
  rep: { name: string; email: string };
  territory: string | null;
  lineItems: OrderLineItem[];
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Product picker state
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);

  const canEdit = order?.status === 'DRAFT';

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/orders/${id}`);
        const data = await res.json();

        if (data.error) {
          setError(data.error.message);
        } else {
          setOrder(data.data);
        }
      } catch (err) {
        setError('Failed to load order');
        console.error('Error fetching order:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchOrder();
  }, [id]);

  // Fetch products for picker
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (searchQuery) {
        params.set('query', searchQuery);
      }

      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();

      if (data.data?.items) {
        setProducts(data.data.items);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoadingProducts(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (showProductPicker) {
      fetchProducts();
    }
  }, [showProductPicker, fetchProducts]);

  // Update line item quantity
  const updateQuantity = async (lineItemId: string, newQuantity: number) => {
    if (!order) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: newQuantity > 0 ? 'update_item' : 'remove_item',
          item: { lineItemId, quantity: newQuantity },
        }),
      });
      const data = await res.json();
      if (data.data) {
        setOrder(data.data);
      } else {
        alert(data.error?.message || 'Failed to update');
      }
    } catch (err) {
      console.error('Error updating quantity:', err);
      alert('Failed to update quantity');
    } finally {
      setSaving(false);
    }
  };

  // Remove line item
  const removeItem = async (lineItemId: string) => {
    if (!order) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove_item',
          item: { lineItemId },
        }),
      });
      const data = await res.json();
      if (data.data) {
        setOrder(data.data);
      } else {
        alert(data.error?.message || 'Failed to remove item');
      }
    } catch (err) {
      console.error('Error removing item:', err);
      alert('Failed to remove item');
    } finally {
      setSaving(false);
    }
  };

  // Add product to order
  const addToOrder = async (product: Product, variant: ProductVariant) => {
    if (!order) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_item',
          item: {
            variantId: variant.shopifyVariantId,
            productId: product.shopifyProductId,
            title: product.title,
            variantTitle: variant.title !== 'Default Title' ? variant.title : null,
            sku: variant.sku,
            quantity: 1,
            unitPriceCents: variant.priceCents,
            imageUrl: product.imageUrl,
          },
        }),
      });
      const data = await res.json();
      if (data.data) {
        setOrder(data.data);
      } else {
        alert(data.error?.message || 'Failed to add item');
      }
    } catch (err) {
      console.error('Error adding to order:', err);
      alert('Failed to add item');
    } finally {
      setSaving(false);
      setSelectedProduct(null);
      setShowProductPicker(false);
    }
  };

  // Submit for review
  const submitForReview = async () => {
    if (!order || order.lineItems.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit_for_review' }),
      });
      const data = await res.json();
      if (data.data) {
        setOrder(data.data);
      } else {
        alert(data.error?.message || 'Failed to submit for review');
      }
    } catch (err) {
      console.error('Error submitting for review:', err);
      alert('Failed to submit for review');
    } finally {
      setSaving(false);
    }
  };

  const formatCents = (cents: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  const getStatusColor = (status: string | null) => {
    if (!status) return 'bg-gray-100 text-gray-600';
    const s = status.toLowerCase();
    if (s === 'draft') return 'bg-blue-100 text-blue-700';
    if (s === 'awaiting_review') return 'bg-orange-100 text-orange-700';
    if (s.includes('paid') || s.includes('fulfilled')) return 'bg-green-100 text-green-700';
    if (s.includes('pending') || s.includes('partial')) return 'bg-yellow-100 text-yellow-700';
    if (s.includes('refund') || s.includes('cancelled')) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: 'Draft',
      AWAITING_REVIEW: 'Awaiting Review',
      PENDING: 'Pending',
      PAID: 'Paid',
      CANCELLED: 'Cancelled',
      REFUNDED: 'Refunded',
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/orders" className="min-w-touch min-h-touch flex items-center justify-center -ml-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Loading...</h1>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/orders" className="min-w-touch min-h-touch flex items-center justify-center -ml-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Error</h1>
        </div>
        <div className="card text-center py-8">
          <p className="text-red-500">{error || 'Order not found'}</p>
          <Link href="/orders" className="btn-secondary mt-4 inline-block">
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${canEdit ? 'pb-36' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/orders" className="min-w-touch min-h-touch flex items-center justify-center -ml-2">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            {order.shopifyOrderNumber || order.orderNumber}
          </h1>
          <p className="text-sm text-gray-500">
            {order.placedAt ? formatDate(order.placedAt) : formatDate(order.createdAt)}
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Status</h2>
        <div className="flex items-center gap-2">
          <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(order.status)}`}>
            {getStatusLabel(order.status)}
          </span>
          {canEdit && (
            <span className="text-xs text-gray-500">(You can edit this order)</span>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Items ({order.lineItems.length})</h2>
        {order.lineItems.length === 0 ? (
          <p className="text-sm text-gray-500">No items yet</p>
        ) : (
          <div className="space-y-3">
            {order.lineItems.map((item) => (
              <div key={item.id} className="flex gap-3 items-center">
                <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{item.title}</p>
                  {item.variantTitle && (
                    <p className="text-xs text-gray-500">{item.variantTitle}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {formatCents(item.unitPriceCents, order.currency)} × {item.quantity}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      disabled={saving}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="w-8 text-center font-medium">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      disabled={saving}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      disabled={saving}
                      className="w-8 h-8 text-red-500 flex items-center justify-center disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <p className="font-medium text-gray-900 text-sm">
                    {formatCents(item.totalCents, order.currency)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Products Button */}
        {canEdit && (
          <button
            onClick={() => setShowProductPicker(true)}
            className="w-full mt-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-500 hover:text-primary-600 transition-colors"
          >
            + Add Products
          </button>
        )}
      </div>

      {/* Totals */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span>{formatCents(order.subtotalCents, order.currency)}</span>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-{formatCents(order.discountCents, order.currency)}</span>
            </div>
          )}
          {order.shippingCents > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Shipping</span>
              <span>{formatCents(order.shippingCents, order.currency)}</span>
            </div>
          )}
          {order.taxCents > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Tax</span>
              <span>{formatCents(order.taxCents, order.currency)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-gray-100">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-bold text-lg text-gray-900">
              {formatCents(order.totalCents, order.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Order Info */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Order Info</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Company</span>
            <span>{order.companyName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Placed by</span>
            <span>{order.rep.name}</span>
          </div>
          {order.territory && (
            <div className="flex justify-between">
              <span className="text-gray-500">Territory</span>
              <span>{order.territory}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Order ID</span>
            <span className="font-mono text-xs">{order.orderNumber}</span>
          </div>
        </div>
        {order.note && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Note</p>
            <p className="text-sm text-gray-600">{order.note}</p>
          </div>
        )}
      </div>

      {/* Product Picker Modal */}
      {showProductPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
          <div className="bg-white flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => {
                    setShowProductPicker(false);
                    setSearchQuery('');
                  }}
                  className="p-2 -m-2"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h3 className="font-semibold text-lg">Add Products</h3>
              </div>
              <div className="relative">
                <input
                  type="search"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10 w-full"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingProducts ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Loading products...</p>
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No products found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {searchQuery ? 'Try a different search term' : 'Products will appear once synced'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {products.map((product) => {
                    // Check if any variant of this product is already in the order
                    const existingItem = order.lineItems.find((item) =>
                      product.variants.some((v) => v.shopifyVariantId === item.shopifyVariantId)
                    );

                    return (
                      <button
                        key={product.id}
                        className="card text-left relative"
                        onClick={() => setSelectedProduct(product)}
                      >
                        {existingItem && (
                          <div className="absolute -top-2 -right-2 bg-primary-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-semibold">
                            {existingItem.quantity}
                          </div>
                        )}
                        <div className="aspect-square bg-gray-100 rounded-lg mb-2 overflow-hidden">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                        <p className="font-medium text-gray-900 text-sm line-clamp-2">{product.title}</p>
                        <p className="text-primary-600 font-semibold mt-1">
                          {formatCents(product.variants[0]?.priceCents || 0, order.currency)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Variant Selection Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl p-4 safe-bottom animate-slide-up">
            <div className="flex items-start justify-between mb-4">
              <div className="flex gap-3">
                <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {selectedProduct.imageUrl ? (
                    <img
                      src={selectedProduct.imageUrl}
                      alt={selectedProduct.title}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{selectedProduct.title}</h3>
                  <p className="text-primary-600 font-semibold">
                    {formatCents(selectedProduct.variants[0]?.priceCents || 0, order.currency)}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-2 -m-2">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selectedProduct.variants.map((variant) => (
                <button
                  key={variant.id}
                  className={`w-full p-3 rounded-lg border text-left flex justify-between items-center ${
                    variant.available
                      ? 'border-gray-200 hover:border-primary-500'
                      : 'border-gray-100 bg-gray-50 opacity-50'
                  }`}
                  disabled={!variant.available || saving}
                  onClick={() => addToOrder(selectedProduct, variant)}
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {variant.title === 'Default Title' ? 'Standard' : variant.title}
                    </p>
                    {variant.sku && <p className="text-xs text-gray-500">SKU: {variant.sku}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary-600">
                      {formatCents(variant.priceCents, order.currency)}
                    </p>
                    {!variant.available && <p className="text-xs text-red-500">Out of stock</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action Bar for DRAFT orders */}
      {canEdit && (
        <div className="fixed bottom-20 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-bottom z-30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{order.lineItems.length} items</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCents(order.totalCents, order.currency)}
              </p>
            </div>
            <button
              onClick={submitForReview}
              disabled={saving || order.lineItems.length === 0}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Submitting...' : 'Submit for Review'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
