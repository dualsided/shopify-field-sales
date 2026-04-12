'use client';

import { useParams } from 'next/navigation';
import { OrderForm } from '@/components/orders/OrderForm';

export default function CompanyOrderPage() {
  const params = useParams();
  const companyId = params.id as string;

  return (
    <OrderForm
      mode="create"
      companyId={companyId}
      onSuccess={(orderId) => {
        console.log('Order created:', orderId);
      }}
    />
  );
}
