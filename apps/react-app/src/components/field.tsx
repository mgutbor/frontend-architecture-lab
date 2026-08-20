import type { ReactNode } from 'react'

export interface FieldProps {
  id: string
  label: string
  errors?: string[]
  children: ReactNode
}

// Form field wrapper: associates the label with the control (ACC-3) and wires
// inline validation errors through aria-describedby + aria-invalid (ACC-4).
// The control itself must render with the given id and, when errors exist,
// set aria-invalid and aria-describedby="{id}-error".
export function Field({ id, label, errors, children }: FieldProps) {
  const hasErrors = errors !== undefined && errors.length > 0
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hasErrors ? (
        <span className="field-error" id={`${id}-error`} role="alert">
          {errors?.join(' · ')}
        </span>
      ) : null}
    </div>
  )
}
