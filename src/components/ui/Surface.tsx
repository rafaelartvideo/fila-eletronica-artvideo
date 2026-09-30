import type { HTMLAttributes, ReactNode } from 'react';

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'article' | 'div';
  tone?: 'default' | 'soft' | 'raised';
  children: ReactNode;
};

export function Surface({ as = 'section', tone = 'default', className = '', children, ...props }: SurfaceProps) {
  const Component = as;
  return <Component className={['ui-surface', `ui-surface--${tone}`, className].filter(Boolean).join(' ')} {...props}>{children}</Component>;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className = '',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return <header className={['ui-section-header', className].filter(Boolean).join(' ')}>
    <div className="ui-section-header__copy">
      {eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}
      <h2 className="ui-section-title">{title}</h2>
      {description && <p className="ui-section-description">{description}</p>}
    </div>
    {actions && <div className="ui-section-header__actions">{actions}</div>}
  </header>;
}

export function EmptyState({ icon, children, className = '' }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return <div className={['ui-empty-state', className].filter(Boolean).join(' ')}>
    {icon && <span className="ui-empty-state__icon">{icon}</span>}
    <span>{children}</span>
  </div>;
}

export function Notice({ tone = 'info', children, className = '' }: { tone?: 'info' | 'success' | 'warning' | 'danger'; children: ReactNode; className?: string }) {
  return <div className={['ui-notice', `ui-notice--${tone}`, className].filter(Boolean).join(' ')} role={tone === 'danger' ? 'alert' : undefined}>{children}</div>;
}
