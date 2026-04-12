'use client';

import { createContext, useContext, useState, useEffect } from 'react';

interface Branding {
  logoUrl: string | null;
  accentColor: string;
  shopName: string;
}

interface BrandingContextValue {
  branding: Branding | null;
  loading: boolean;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: null,
  loading: true,
});

export function useBranding() {
  return useContext(BrandingContext);
}

interface BrandingProviderProps {
  children: React.ReactNode;
}

// Convert hex to HSL for Tailwind CSS variable compatibility
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// Generate color shades from a base color
function generateColorShades(hex: string): Record<string, string> {
  const { h, s } = hexToHSL(hex);

  return {
    '50': `hsl(${h}, ${Math.min(s + 10, 100)}%, 97%)`,
    '100': `hsl(${h}, ${Math.min(s + 5, 100)}%, 94%)`,
    '200': `hsl(${h}, ${s}%, 86%)`,
    '300': `hsl(${h}, ${s}%, 74%)`,
    '400': `hsl(${h}, ${s}%, 58%)`,
    '500': `hsl(${h}, ${s}%, 48%)`,
    '600': `hsl(${h}, ${s}%, 42%)`,
    '700': `hsl(${h}, ${s}%, 35%)`,
    '800': `hsl(${h}, ${s}%, 28%)`,
    '900': `hsl(${h}, ${s}%, 22%)`,
    '950': `hsl(${h}, ${s}%, 14%)`,
  };
}

export function BrandingProvider({ children }: BrandingProviderProps) {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBranding() {
      try {
        const response = await fetch('/api/branding');
        const result = await response.json();

        if (result.data) {
          setBranding(result.data);

          // Set CSS variables for accent color
          const shades = generateColorShades(result.data.accentColor);
          const root = document.documentElement;

          Object.entries(shades).forEach(([shade, value]) => {
            root.style.setProperty(`--color-primary-${shade}`, value);
          });

          // Also set the raw accent color
          root.style.setProperty('--color-accent', result.data.accentColor);
        } else if (result.error) {
          console.error('Branding API error:', result.error);
        }
      } catch (error) {
        console.error('Failed to fetch branding:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchBranding();
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export default BrandingProvider;
