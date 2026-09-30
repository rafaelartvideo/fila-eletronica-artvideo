import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  loading?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  loading = false,
  startIcon,
  endIcon,
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    iconOnly ? 'ui-button--icon' : '',
    className,
  ].filter(Boolean).join(' ');

  return <button className={classes} disabled={disabled || loading} {...props}>
    {startIcon && <span className="ui-button__icon" aria-hidden="true">{startIcon}</span>}
    {iconOnly ? children : loading ? 'Aguarde…' : children}
    {endIcon && <span className="ui-button__icon" aria-hidden="true">{endIcon}</span>}
  </button>;
}
