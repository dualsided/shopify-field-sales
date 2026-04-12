import { BottomNav } from '@/components/ui/BottomNav';
import { BrandingProvider, Header, SaveBarProvider, ToastProvider } from '@/components/ui';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BrandingProvider>
      <SaveBarProvider>
        <ToastProvider>
          <div className="min-h-screen flex flex-col px-4">
            <Header />
            <main className="flex-1 pb-28">{children}</main>
            <BottomNav />
          </div>
        </ToastProvider>
      </SaveBarProvider>
    </BrandingProvider>
  );
}
