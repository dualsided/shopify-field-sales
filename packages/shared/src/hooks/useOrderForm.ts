/**
 * useOrderForm Hook
 *
 * Platform-agnostic order form state management.
 * Works with React (web) and React Native.
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import type {
  OrderFormData,
  InitialOrderData,
  FormOrderLineItem,
  FormAppliedPromotion,
  ShippingOption,
  CompanyOption,
  ContactOption,
  LocationOption,
  FormPaymentTerms,
} from './types';

const DEFAULT_FORM_DATA: OrderFormData = {
  status: 'DRAFT',
  shopifyOrderId: null,
  company: null,
  contact: null,
  shippingLocation: null,
  billingLocation: null,
  lineItems: [],
  appliedPromotions: [],
  selectedShippingOption: null,
  note: '',
  poNumber: '',
  paymentTerms: 'DUE_ON_ORDER',
  subtotalCents: 0,
  discountCents: 0,
  shippingCents: 0,
  taxCents: 0,
  totalCents: 0,
  currency: 'USD',
  timelineEvents: [],
};

function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function useOrderForm(initialData?: InitialOrderData) {
  // Build initial form data
  const buildFormData = useCallback((): OrderFormData => {
    return {
      ...DEFAULT_FORM_DATA,
      ...initialData,
      lineItems: initialData?.lineItems || [],
      appliedPromotions: initialData?.appliedPromotions || [],
      timelineEvents: initialData?.timelineEvents || [],
    };
  }, [initialData]);

  // Store initial state for dirty checking
  const initialRef = useRef<OrderFormData | null>(null);

  // Form state
  const [formData, setFormData] = useState<OrderFormData>(() => {
    const data = buildFormData();
    initialRef.current = JSON.parse(JSON.stringify(data));
    return data;
  });

  // Extract only user-editable fields for dirty comparison
  // Excludes auto-calculated fields: taxCents, totalCents, subtotalCents, discountCents, appliedPromotions, free items
  const getUserEditableState = useCallback((data: OrderFormData) => {
    // Only include non-free line items with relevant fields
    const editableLineItems = data.lineItems
      .filter((item) => !item.isFreeItem)
      .map((item) => ({
        shopifyVariantId: item.shopifyVariantId,
        quantity: item.quantity,
      }));

    return {
      company: data.company?.id || null,
      contact: data.contact?.id || null,
      shippingLocation: data.shippingLocation?.id || null,
      billingLocation: data.billingLocation?.id || null,
      lineItems: editableLineItems,
      selectedShippingOption: data.selectedShippingOption?.id || null,
      note: data.note,
      poNumber: data.poNumber,
    };
  }, []);

  // Check if form is dirty (only comparing user-editable fields)
  const isDirty = useMemo(() => {
    if (!initialRef.current) return false;
    const currentEditable = getUserEditableState(formData);
    const initialEditable = getUserEditableState(initialRef.current);
    return JSON.stringify(currentEditable) !== JSON.stringify(initialEditable);
  }, [formData, getUserEditableState]);

  // Reset to initial state
  const resetForm = useCallback(() => {
    if (initialRef.current) {
      setFormData(JSON.parse(JSON.stringify(initialRef.current)));
    }
  }, []);

  // Update initial reference (after save)
  const updateInitialRef = useCallback(() => {
    initialRef.current = JSON.parse(JSON.stringify(formData));
  }, [formData]);

  // Company handlers
  const setCompany = useCallback((company: CompanyOption | null) => {
    setFormData((prev) => ({
      ...prev,
      company,
      // Clear dependent fields when company changes
      contact: null,
      shippingLocation: null,
      billingLocation: null,
    }));
  }, []);

  // Contact handlers
  const setContact = useCallback((contact: ContactOption | null) => {
    setFormData((prev) => ({ ...prev, contact }));
  }, []);

  // Location handlers
  const setShippingLocation = useCallback((shippingLocation: LocationOption | null) => {
    setFormData((prev) => ({ ...prev, shippingLocation }));
  }, []);

  const setBillingLocation = useCallback((billingLocation: LocationOption | null) => {
    setFormData((prev) => ({ ...prev, billingLocation }));
  }, []);

  // Line item handlers
  const addLineItem = useCallback((item: Omit<FormOrderLineItem, 'id' | 'discountCents' | 'totalCents'>) => {
    setFormData((prev) => {
      // Check if variant already exists
      const existingIndex = prev.lineItems.findIndex(
        (li) => li.shopifyVariantId === item.shopifyVariantId && !li.isFreeItem
      );

      let newLineItems: FormOrderLineItem[];

      if (existingIndex >= 0) {
        // Increment quantity
        newLineItems = prev.lineItems.map((li, index) => {
          if (index === existingIndex) {
            const newQty = li.quantity + item.quantity;
            return {
              ...li,
              quantity: newQty,
              totalCents: li.unitPriceCents * newQty - li.discountCents,
            };
          }
          return li;
        });
      } else {
        // Add new item
        const newItem: FormOrderLineItem = {
          ...item,
          id: generateTempId(),
          discountCents: 0,
          totalCents: item.unitPriceCents * item.quantity,
        };
        newLineItems = [...prev.lineItems, newItem];
      }

      return {
        ...prev,
        lineItems: newLineItems,
      };
    });
  }, []);

  const updateLineItemQuantity = useCallback((itemId: string, quantity: number) => {
    setFormData((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            quantity,
            totalCents: item.unitPriceCents * quantity - item.discountCents,
          };
        }
        return item;
      }),
    }));
  }, []);

  const removeLineItem = useCallback((itemId: string) => {
    setFormData((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((item) => item.id !== itemId),
    }));
  }, []);

  // Shipping handler
  const setShippingOption = useCallback((option: ShippingOption | null) => {
    setFormData((prev) => ({
      ...prev,
      selectedShippingOption: option,
      shippingCents: option?.priceCents || 0,
    }));
  }, []);

  // Note and PO number handlers
  const setNote = useCallback((note: string) => {
    setFormData((prev) => ({ ...prev, note }));
  }, []);

  const setPoNumber = useCallback((poNumber: string) => {
    setFormData((prev) => ({ ...prev, poNumber }));
  }, []);

  // Payment terms handler
  const setPaymentTerms = useCallback((paymentTerms: FormPaymentTerms) => {
    setFormData((prev) => ({ ...prev, paymentTerms }));
  }, []);

  // Tax update handler (auto-calculated, doesn't affect dirty state)
  const setTax = useCallback((taxCents: number) => {
    setFormData((prev) => ({
      ...prev,
      taxCents,
      totalCents: Math.max(0, prev.subtotalCents - prev.discountCents + prev.shippingCents + taxCents),
    }));
  }, []);

  // Totals update (called after promotion evaluation - auto-calculated, doesn't affect dirty state)
  const updateTotals = useCallback((
    lineItems: FormOrderLineItem[],
    appliedPromotions: FormAppliedPromotion[],
    discountCents: number
  ) => {
    setFormData((prev) => {
      // Calculate subtotal from non-free items
      const regularItems = lineItems.filter((item) => !item.isFreeItem);
      const subtotalCents = regularItems.reduce(
        (sum, item) => sum + item.unitPriceCents * item.quantity,
        0
      );

      const shippingCents = prev.selectedShippingOption?.priceCents || 0;
      const taxCents = prev.taxCents;
      const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents + taxCents);

      return {
        ...prev,
        lineItems,
        appliedPromotions,
        subtotalCents,
        discountCents,
        totalCents,
      };
    });
  }, []);

  return {
    formData,
    setFormData,
    isDirty,
    resetForm,
    updateInitialRef,
    // Handlers
    setCompany,
    setContact,
    setShippingLocation,
    setBillingLocation,
    addLineItem,
    updateLineItemQuantity,
    removeLineItem,
    setShippingOption,
    setNote,
    setPoNumber,
    setPaymentTerms,
    setTax,
    updateTotals,
  };
}

export default useOrderForm;
