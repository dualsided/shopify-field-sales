/**
 * Component Types
 *
 * Platform-agnostic component prop types and interfaces.
 * These types are shared across web and React Native implementations.
 */

// ============================================
// Base Component Props
// ============================================

/** Common props for all pressable/touchable components */
export interface PressableProps {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/** Common props for text display */
export interface TextProps {
  variant?: 'body' | 'caption' | 'label' | 'title' | 'heading';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  color?: string;
  align?: 'left' | 'center' | 'right';
  numberOfLines?: number;
  children: React.ReactNode;
}

// ============================================
// Button Component
// ============================================

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
}

// ============================================
// Input Component
// ============================================

export type InputType = 'text' | 'email' | 'password' | 'phone' | 'number' | 'search';

export interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  type?: InputType;
  disabled?: boolean;
  error?: string;
  label?: string;
  hint?: string;
  maxLength?: number;
  autoFocus?: boolean;
  autoComplete?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  accessibilityLabel?: string;
  testID?: string;
}

// ============================================
// Card Component
// ============================================

export interface CardProps {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

// ============================================
// Badge Component
// ============================================

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}

// ============================================
// Spinner/Loading Component
// ============================================

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

// ============================================
// Icon Component
// ============================================

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  accessibilityLabel?: string;
}

// ============================================
// Avatar Component
// ============================================

export interface AvatarProps {
  source?: { uri: string } | null;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallbackInitials?: string;
}

// ============================================
// List Components
// ============================================

export interface ListItemProps extends PressableProps {
  title: string;
  subtitle?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
}

export interface ListSectionProps {
  title?: string;
  children: React.ReactNode;
}

// ============================================
// Modal/Sheet Components
// ============================================

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  height?: 'auto' | 'half' | 'full';
  children: React.ReactNode;
}

// ============================================
// Form Components
// ============================================

export interface SelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T = string> {
  value: T | null;
  onValueChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  error?: string;
}

// ============================================
// Empty State Component
// ============================================

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onPress: () => void;
  };
}

// ============================================
// Toast/Alert Component
// ============================================

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  variant: ToastVariant;
  message: string;
  visible: boolean;
  onDismiss?: () => void;
  duration?: number;
}
