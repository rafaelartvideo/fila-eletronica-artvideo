import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Tabs({ className = '', children, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <nav className={['ui-tabs', className].filter(Boolean).join(' ')} {...props}>{children}</nav>;
}

export function TabButton({
  selected = false,
  icon,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  icon?: ReactNode;
}) {
  return <button
    type="button"
    className={['ui-tab', selected ? 'is-selected' : '', className].filter(Boolean).join(' ')}
    aria-pressed={selected}
    {...props}
  >
    {icon && <span className="ui-tab__icon" aria-hidden="true">{icon}</span>}
    <span className="ui-tab__label">{children}</span>
  </button>;
}
