'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useSaveBarContext } from './SaveBarContext';

interface BackButtonProps {
  href?: string;
  className?: string;
}

export function BackButton({ href, className = '' }: BackButtonProps) {
  const router = useRouter();
  const { isDirty, triggerShake } = useSaveBarContext();

  const handleClick = () => {
    if (isDirty) {
      triggerShake();
    } else if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`min-w-touch min-h-touch flex items-center justify-center -ml-2 ${className}`}
    >
      <ChevronLeft className="w-6 h-6" />
    </button>
  );
}

export default BackButton;
