import type { HTMLAttributes, ReactNode } from 'react';

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function Badge({
  tone = 'neutral',
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; children: ReactNode }) {
  return <span className={['ui-badge', `ui-badge--${tone}`, className].filter(Boolean).join(' ')} {...props}>{children}</span>;
}

export function IconTile({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={['ui-icon-tile', className].filter(Boolean).join(' ')} aria-hidden="true">{children}</span>;
}
