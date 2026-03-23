'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { CartLineItem, CartSummary, Company } from '@/types';

interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  available: boolean;
  inventoryQuantity: number | null;
}

interface Product {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  price: string;
  currency: string;
  variants: ProductVariant[];
}

export default function OrderPage() {
  const params = useParams();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cartItems, setCartItems] = useState<CartLineItem[]>([]);
  const [cartSummary, setCartSummary] = useState<CartSummary>({ itemCount: 0, subtotal: '0.00', currency: 'USD' });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch company details
  useEffect(() => {
    async function fetchCompany() {
      try {
        const res = await fetch(`/api/companies/${companyId}`);
        const data = await res.json();
        if (data.data) {
          setCompany(data.data);
        }
      } catch (error) {
        console.error('Error fetching company:', error);
      }
    }
    fetchCompany();
  }, [companyId]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (searchQuery) {
        params.set('query', searchQuery);
      }

      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();

      if (data.data?.products) {
        setProducts(data.data.products);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoadingProducts(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Fetch cart
  useEffect(() => {
    async function fetchCart() {
      if (!company) return;

      try {
        const res = await fetch(`/api/cart?companyId=${company.shopifyCompanyId}`);
        const data = await res.json();

        if (data.data) {
          setCartItems(data.data.cart.lineItems);
          setCartSummary(data.data.summary);
        }
      } catch (error) {
        console.error('Error fetching cart:', error);
      }
    }
    fetchCart();
  }, [company]);

  // Add to cart
  const addToCart = async (product: Product, variant: ProductVariant) => {
    if (!company) return;

    try {
      const res = await fetch('/api/cart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id,
          action: 'add',
          item: {
            variantId: variant.id,
            productId: product.id,
            title: product.title,
            variantTitle: variant.title !== 'Default Title' ? variant.title : undefined,
            sku: variant.sku,
            quantity: 1,
            price: variant.price,
            imageUrl: product.imageUrl,
          },
        }),
      });

      const data = await res.json();
      if (data.data) {
        setCartItems(data.data.cart.lineItems);
        setCartSummary(data.data.summary);
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
    }

    setSelectedProduct(null);
  };

  // Update cart item quantity
  const updateQuantity = async (variantId: string, quantity: number) => {
    if (!company) return;

    try {
      const res = await fetch('/api/cart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id,
          action: quantity > 0 ? 'update' : 'remove',
          item: { variantId, quantity },
        }),
      });

      const data = await res.json();
      if (data.data) {
        setCartItems(data.data.cart.lineItems);
        setCartSummary(data.data.summary);
      }
    } catch (error) {
      console.error('Error updating cart:', error);
    }
  };

  // Submit order
  const submitOrder = async () => {
    if (!company || cartItems.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id,
        }),
      });

      const data = await res.json();
      if (data.data) {
        // Redirect to order confirmation
        window.location.href = `/orders/${data.data.id}`;
      } else {
        alert(data.error?.message || 'Failed to submit order');
      }
    } catch (error) {
      console.error('Error submitting order:', error);
      alert('Failed to submit order');
    } finally {
      setSubmitting(false);
    }
  };

  const formatPrice = (amount: string, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(parseFloat(amount));
  };

  return (
    <div className="space-y-4 pb-36">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/accounts/${companyId}`}
          className="min-w-touch min-h-touch flex items-center justify-center -ml-2"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">New Order</h1>
          {company && <p className="text-sm text-gray-500">{company.name}</p>}
        </div>
      </div>

      {/* Product Search */}
      <div className="relative">
        <input
          type="search"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input pl-10"
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

      {/* Product Grid */}
      <div className="grid grid-cols-2 gap-3">
        {loadingProducts ? (
          <div className="col-span-2 card text-center py-8">
            <p className="text-gray-500">Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="col-span-2 card text-center py-8">
            <p className="text-gray-500">No products found</p>
            <p className="text-sm text-gray-400 mt-1">
              {searchQuery ? 'Try a different search term' : 'Products will appear once synced from Shopify'}
            </p>
          </div>
        ) : (
          products.map((product) => {
            const cartItem = cartItems.find((item) =>
              product.variants.some((v) => v.id === item.variantId)
            );

            return (
              <button
                key={product.id}
                className="card text-left relative"
                onClick={() => setSelectedProduct(product)}
              >
                {cartItem && (
                  <div className="absolute -top-2 -right-2 bg-primary-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-semibold">
                    {cartItem.quantity}
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="font-medium text-gray-900 text-sm line-clamp-2">{product.title}</p>
                <p className="text-primary-600 font-semibold mt-1">
                  {formatPrice(product.price, product.currency)}
                </p>
              </button>
            );
          })
        )}
      </div>

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
                    {formatPrice(selectedProduct.price, selectedProduct.currency)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-2 -m-2"
              >
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
                  disabled={!variant.available}
                  onClick={() => addToCart(selectedProduct, variant)}
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {variant.title === 'Default Title' ? 'Standard' : variant.title}
                    </p>
                    {variant.sku && (
                      <p className="text-xs text-gray-500">SKU: {variant.sku}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary-600">
                      {formatPrice(variant.price, selectedProduct.currency)}
                    </p>
                    {!variant.available && (
                      <p className="text-xs text-red-500">Out of stock</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cart Bottom Sheet */}
      {showCart && cartItems.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowCart(false)}>
          <div
            className="fixed bottom-20 left-0 right-0 bg-white border-t border-gray-200 rounded-t-2xl max-h-[60vh] overflow-y-auto safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white p-4 border-b border-gray-100">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900">Cart ({cartSummary.itemCount} items)</h3>
                <button onClick={() => setShowCart(false)} className="p-2 -m-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {cartItems.map((item) => (
                <div key={item.variantId} className="flex gap-3 items-center">
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
                    <p className="text-sm text-primary-600">{formatPrice(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="w-8 text-center font-medium">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cart Summary Bar */}
      <div className="fixed bottom-20 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-bottom z-30">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowCart(true)}
            className="flex items-center gap-2"
            disabled={cartItems.length === 0}
          >
            <div className="relative">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {cartSummary.itemCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {cartSummary.itemCount}
                </span>
              )}
            </div>
            <div className="text-left">
              <p className="text-sm text-gray-500">{cartSummary.itemCount} items</p>
              <p className="text-lg font-bold text-gray-900">{formatPrice(cartSummary.subtotal)}</p>
            </div>
          </button>
          <button
            className="btn-primary"
            disabled={cartItems.length === 0 || submitting}
            onClick={submitOrder}
          >
            {submitting ? 'Submitting...' : 'Place Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
