# Component Framework

Guidelines and patterns for building components in the Field Sales app.

## Directory Structure

```
src/components/
├── ui/                    # Reusable UI primitives
│   ├── BottomSheet.tsx    # Modal slide-up sheet (z-60)
│   ├── SaveBar.tsx        # Floating save bar with shake animation
│   ├── SaveBarContext.tsx # Dirty state + shake trigger context
│   ├── BackButton.tsx     # Back navigation with dirty check
│   └── index.ts           # Barrel exports
├── pickers/               # Selection components
│   ├── CompanyPicker.tsx  # Company selection
│   ├── ContactPicker.tsx  # Contact selection
│   ├── LocationPicker.tsx # Location selection
│   ├── ProductPicker.tsx  # Product/variant selection
│   └── index.ts
├── orders/                # Order-specific components
│   ├── OrderForm.tsx      # Main orchestrator
│   ├── CompanySection.tsx # Form section
│   ├── ProductsSection.tsx
│   └── index.ts
└── [feature]/             # Feature-specific components
```

## Component Patterns

### 1. UI Primitives (`/ui`)

Reusable, feature-agnostic components. Should:
- Have no business logic
- Accept generic props
- Be composable
- Export from index.ts

**Example: BottomSheet**

```tsx
interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  height?: 'auto' | 'half' | 'full';
  children: React.ReactNode;
}

export function BottomSheet({ isOpen, onClose, title, height, children }: BottomSheetProps) {
  // Implementation - uses z-60 to appear above SaveBar
}
```

**SaveBarContext**

Provides dirty state management and shake animation trigger across components:

```tsx
interface SaveBarContextType {
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  triggerShake: () => void;
  isShaking: boolean;
}

// Usage in components
const { isDirty, setIsDirty, triggerShake, isShaking } = useSaveBarContext();
```

**BackButton**

Navigation component that respects dirty state:

```tsx
interface BackButtonProps {
  href?: string;        // Explicit destination (optional)
  className?: string;
}

// Usage - blocks navigation when dirty, triggers shake
<BackButton href="/orders" />
<BackButton />  // Uses router.back() when no href
```

### 2. Pickers (`/pickers`)

Selection components that use BottomSheet. Should:
- Use consistent trigger button pattern
- Support `selected` and `onSelect` props
- Handle loading and empty states
- Filter by parent entity when needed (e.g., `companyId`)

**Picker Interface Pattern:**

```tsx
interface [Entity]PickerProps {
  selected: [Entity]Option | null;
  onSelect: (value: [Entity]Option | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  // Parent filters
  parentId?: string | null;
}

export interface [Entity]Option {
  id: string;
  name: string;
  // Additional display fields
}
```

**Example: Creating a New Picker**

```tsx
// src/components/pickers/TerritoryPicker.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { BottomSheet } from '../ui/BottomSheet';

export interface TerritoryOption {
  id: string;
  name: string;
  repCount: number;
}

interface TerritoryPickerProps {
  selected: TerritoryOption | null;
  onSelect: (territory: TerritoryOption | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function TerritoryPicker({
  selected,
  onSelect,
  label = 'Territory',
  placeholder = 'Select a territory...',
  disabled = false,
}: TerritoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [territories, setTerritories] = useState<TerritoryOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch data when sheet opens
  useEffect(() => {
    if (isOpen) {
      fetchTerritories();
    }
  }, [isOpen]);

  const fetchTerritories = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/territories');
      const data = await res.json();
      if (data.data) {
        setTerritories(data.data);
      }
    } catch (error) {
      console.error('Error fetching territories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (territory: TerritoryOption) => {
    onSelect(territory);
    setIsOpen(false);
  };

  return (
    <>
      {/* Trigger Button */}
      <div>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          disabled={disabled}
          className="w-full p-3 text-left border border-gray-300 rounded-lg bg-white"
        >
          {selected ? (
            <span className="text-gray-900">{selected.name}</span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </button>
      </div>

      {/* Selection Sheet */}
      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Select Territory"
        height="half"
      >
        {loading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : territories.length === 0 ? (
          <div className="p-4 text-center text-gray-500">No territories found</div>
        ) : (
          <div className="p-2">
            {territories.map((territory) => (
              <button
                key={territory.id}
                type="button"
                onClick={() => handleSelect(territory)}
                className="w-full p-3 text-left hover:bg-gray-50 rounded-lg"
              >
                <p className="font-medium text-gray-900">{territory.name}</p>
                <p className="text-sm text-gray-500">{territory.repCount} reps</p>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
```

### 3. Form Sections

Section components for complex forms. Should:
- Be self-contained with clear props interface
- Support `readonly` mode for view-only state
- Use card styling for visual grouping
- Handle their own sub-component composition

**Form Section Pattern:**

```tsx
interface [Feature]SectionProps {
  // Data props
  fieldA: TypeA;
  fieldB: TypeB;
  // Change handlers
  onFieldAChange: (value: TypeA) => void;
  onFieldBChange: (value: TypeB) => void;
  // Mode
  readonly?: boolean;
}

export function [Feature]Section({
  fieldA,
  fieldB,
  onFieldAChange,
  onFieldBChange,
  readonly = false,
}: [Feature]SectionProps) {
  if (readonly) {
    return (
      <div className="card">
        {/* Read-only view */}
      </div>
    );
  }

  return (
    <div className="card">
      {/* Editable view with pickers/inputs */}
    </div>
  );
}
```

### 4. Form Orchestrators

Main form components that compose sections. Should:
- Use custom hooks for state management
- Handle all API interactions
- Compose section components
- Manage loading/saving/error states

**Form Orchestrator Pattern:**

```tsx
interface [Feature]FormProps {
  mode: 'create' | 'edit';
  entityId?: string;        // For edit mode
  initialData?: InitialData;
  onSuccess?: (id: string) => void;
}

export function [Feature]Form({
  mode,
  entityId,
  initialData,
  onSuccess,
}: [Feature]FormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use custom hook for form state
  const {
    formData,
    isDirty,
    resetForm,
    // ...handlers
  } = use[Feature]Form(initialData);

  // Determine readonly state
  const isReadonly = formData.status !== 'DRAFT';

  // API handlers
  async function handleSave() { /* ... */ }
  async function handleSubmit() { /* ... */ }

  return (
    <div className="pb-20">
      {/* Header */}
      {/* Error display */}

      <div className="space-y-4">
        {/* Compose sections */}
        <SectionA {...props} readonly={isReadonly} />
        <SectionB {...props} readonly={isReadonly} />
        <SectionC {...props} readonly={isReadonly} />
      </div>

      {/* SaveBar for dirty state */}
      {!isReadonly && (
        <SaveBar
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={resetForm}
        />
      )}
    </div>
  );
}
```

## Custom Hooks Pattern

### Form State Hook

```tsx
// src/hooks/use[Feature]Form.ts
export interface [Feature]FormData {
  // Form fields
}

export function use[Feature]Form(initialData?: Partial<[Feature]FormData>) {
  // Store initial state for dirty checking
  const initialRef = useRef<[Feature]FormData | null>(null);

  // Form state
  const [formData, setFormData] = useState<[Feature]FormData>(() => {
    const data = { ...DEFAULT_DATA, ...initialData };
    initialRef.current = JSON.parse(JSON.stringify(data));
    return data;
  });

  // Dirty check
  const isDirty = useMemo(() => {
    if (!initialRef.current) return false;
    return JSON.stringify(formData) !== JSON.stringify(initialRef.current);
  }, [formData]);

  // Reset
  const resetForm = useCallback(() => {
    if (initialRef.current) {
      setFormData(JSON.parse(JSON.stringify(initialRef.current)));
    }
  }, []);

  // Update initial ref after save
  const updateInitialRef = useCallback(() => {
    initialRef.current = JSON.parse(JSON.stringify(formData));
  }, [formData]);

  // Field handlers
  const setFieldA = useCallback((value: TypeA) => {
    setFormData((prev) => ({ ...prev, fieldA: value }));
  }, []);

  return {
    formData,
    isDirty,
    resetForm,
    updateInitialRef,
    setFieldA,
    // ...other handlers
  };
}
```

## Styling Conventions

### Tailwind Classes

Use the pre-defined utility classes from `globals.css`:

| Class | Usage |
|-------|-------|
| `.card` | Card container with padding, shadow, rounded |
| `.btn` | Base button styles |
| `.btn-primary` | Primary action button |
| `.btn-secondary` | Secondary action button |
| `.input` | Form input styling |
| `.min-h-touch` | 48px min height for touch targets |
| `.min-w-touch` | 48px min width for touch targets |
| `.safe-bottom` | Bottom safe area padding |

### Mobile-First Design

- Default styles for mobile
- Use `sm:`, `md:`, `lg:` for larger screens
- Touch targets minimum 48px
- Bottom sheets instead of dropdowns
- Fixed bottom bars for primary actions

### Z-Index Layering

| Component | z-index | Purpose |
|-----------|---------|---------|
| SaveBar | z-50 | Floats above content, below modals |
| BottomSheet | z-60 | Modal overlay, above SaveBar |
| BottomNav | — | Fixed bottom navigation |

### Animation Classes

| Class | Usage |
|-------|-------|
| `.animate-slide-up` | Entry animation for SaveBar |
| `.animate-shake` | Shake effect when navigation blocked |

## API Integration

### Response Format

All API endpoints return:

```typescript
interface ApiResponse<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}
```

### Fetching Pattern

```typescript
const fetchData = async () => {
  setLoading(true);
  try {
    const res = await fetch('/api/endpoint');
    const data = await res.json();

    if (data.error) {
      setError(data.error.message);
      return;
    }

    setState(data.data);
  } catch (err) {
    console.error('Error:', err);
    setError('An unexpected error occurred');
  } finally {
    setLoading(false);
  }
};
```

## Index Exports

Always create `index.ts` files for clean imports:

```typescript
// src/components/pickers/index.ts
export { CompanyPicker, type CompanyOption } from './CompanyPicker';
export { ContactPicker, type ContactOption } from './ContactPicker';
export { LocationPicker, type LocationOption } from './LocationPicker';
export { ProductPicker, type SelectedProduct } from './ProductPicker';
```

Usage:
```typescript
import { CompanyPicker, ContactPicker } from '@/components/pickers';
```

## Adding a New Feature Form

Checklist for creating a new feature with forms:

1. **Create Pickers** (if needed)
   - [ ] Create `src/components/pickers/[Entity]Picker.tsx`
   - [ ] Export from `src/components/pickers/index.ts`

2. **Create Form Hook**
   - [ ] Create `src/hooks/use[Feature]Form.ts`
   - [ ] Define form data interface
   - [ ] Implement dirty checking
   - [ ] Add field handlers

3. **Create Form Sections**
   - [ ] Create `src/components/[feature]/[Section]Section.tsx`
   - [ ] Support readonly mode
   - [ ] Use card styling

4. **Create Form Orchestrator**
   - [ ] Create `src/components/[feature]/[Feature]Form.tsx`
   - [ ] Compose sections
   - [ ] Handle API calls
   - [ ] Add SaveBar

5. **Create API Endpoints**
   - [ ] Create `src/app/api/[feature]/route.ts`
   - [ ] Follow response format

6. **Create Pages**
   - [ ] Create route pages under `src/app/(app)/`
   - [ ] Import and use form component

7. **Export Components**
   - [ ] Create `src/components/[feature]/index.ts`

8. **Update Documentation**
   - [ ] Update relevant docs in `/docs`
