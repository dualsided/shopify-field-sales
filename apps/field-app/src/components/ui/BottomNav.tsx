'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Home, Building2, ClipboardList, Lock } from 'lucide-react';
import { useSaveBarContext } from './SaveBarContext';

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: Home,
  },
  {
    href: '/companies',
    label: 'Companies',
    icon: Building2,
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: ClipboardList,
  },
  {
    href: '/account',
    label: 'Account',
    icon: Lock,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isDirty, triggerShake } = useSaveBarContext();

  const handleNavClick = (href: string) => {
    if (isDirty) {
      triggerShake();
    } else {
      router.push(href);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-bottom">
      <div className="flex justify-around">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              onClick={() => handleNavClick(item.href)}
              className={`flex flex-col items-center justify-center min-h-touch min-w-touch py-2 px-4 transition-colors ${
                isActive ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className={`p-1.5 rounded-full transition-colors ${isActive ? 'bg-primary-100' : ''}`}>
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
              </div>
              <span className={`text-xs mt-0.5 ${isActive ? 'font-medium' : ''}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
