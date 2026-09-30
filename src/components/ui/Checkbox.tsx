import type { InputHTMLAttributes, ReactNode } from 'react';

export function Checkbox({
  label,
  description,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  description?: ReactNode;
}) {
  return <label className={['ui-checkbox', className].filter(Boolean).join(' ')}>
    <input type="checkbox" {...props} />
    <span className="ui-checkbox__copy">
      <strong>{label}</strong>
      {description && <small>{description}</small>}
    </span>
  </label>;
}
