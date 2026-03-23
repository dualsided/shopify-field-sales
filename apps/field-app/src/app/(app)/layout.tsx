import { BottomNav } from '@/components/ui/BottomNav';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-20 safe-bottom">
      <main className="px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}
