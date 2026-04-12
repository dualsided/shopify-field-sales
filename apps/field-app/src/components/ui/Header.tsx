'use client';

import { usePathname } from 'next/navigation';
import { useBranding } from './BrandingProvider';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/companies': 'Companies',
  '/orders': 'Orders',
  '/account': 'My Account',
};

function getPageTitle(pathname: string): string {
  // Check for exact match first
  if (pageTitles[pathname]) {
    return pageTitles[pathname];
  }

  // Check for parent route match (e.g., /companies/123 -> Companies)
  for (const [route, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(route + '/')) {
      return title;
    }
  }

  return 'Field Sales';
}

export function Header() {
  const pathname = usePathname();
  const { branding, loading } = useBranding();
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="flex items-center justify-between pt-2 pb-4">
      <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
      {loading ? (
        <div className="h-8 w-24 bg-gray-100 rounded animate-pulse" />
      ) : branding?.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt={branding.shopName || 'Logo'}
          className="h-8 max-w-[120px] object-contain"
        />
      ) : null}
    </header>
  );
}

export default Header;
