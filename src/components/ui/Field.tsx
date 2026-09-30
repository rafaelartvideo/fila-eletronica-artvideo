import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type FieldFrameProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
};

function FieldFrame({ label, hint, error, icon, trailing, className = '', children }: FieldFrameProps) {
  return <label className={['ui-field', error ? 'ui-field--error' : '', className].filter(Boolean).join(' ')}>
    {label && <span className="ui-field__label">{label}</span>}
    <span className="ui-field__control">
      {icon && <span className="ui-field__icon" aria-hidden="true">{icon}</span>}
      {children}
      {trailing && <span className="ui-field__trailing">{trailing}</span>}
    </span>
    {error ? <span className="ui-field__error">{error}</span> : hint ? <span className="ui-field__hint">{hint}</span> : null}
  </label>;
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & Omit<FieldFrameProps, 'children'>;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({
  label, hint, error, icon, trailing, className, ...props
}, ref) {
  return <FieldFrame label={label} hint={hint} error={error} icon={icon} trailing={trailing} className={className}>
    <input ref={ref} className="ui-field__input" {...props} />
  </FieldFrame>;
});

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & Omit<FieldFrameProps, 'children' | 'trailing'>;

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField({
  label, hint, error, icon, className, children, ...props
}, ref) {
  return <FieldFrame label={label} hint={hint} error={error} icon={icon} className={className}>
    <select ref={ref} className="ui-field__input ui-field__select" {...props}>{children}</select>
  </FieldFrame>;
});

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & Omit<FieldFrameProps, 'children' | 'trailing'>;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField({
  label, hint, error, icon, className, ...props
}, ref) {
  return <FieldFrame label={label} hint={hint} error={error} icon={icon} className={className}>
    <textarea ref={ref} className="ui-field__input ui-field__textarea" {...props} />
  </FieldFrame>;
});
