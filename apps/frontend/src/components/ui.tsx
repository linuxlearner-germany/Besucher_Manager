import { cloneElement, isValidElement, type PropsWithChildren, type ReactElement, type ReactNode } from "react";

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <section className={`panel ${className}`.trim()}>{children}</section>;
}

export function Button({
  children,
  className = "",
  ...props
}: PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }>) {
  return (
    <button {...props} className={className}>
      {children}
    </button>
  );
}

export function Alert({ type, children }: PropsWithChildren<{ type: "success" | "error" | "warning" | "info" }>) {
  return <div className={`feedback ${type}`} role={type === "error" || type === "warning" ? "alert" : "status"} aria-live="polite">{children}</div>;
}

export function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <span className="field-label">
      {label}
      {required ? <span className="required-indicator" aria-hidden="true"> *</span> : null}
    </span>
  );
}

export function FormField({
  label,
  required,
  error,
  errorId,
  fieldId,
  children
}: PropsWithChildren<{ label: string; required?: boolean; error?: string; errorId?: string; fieldId?: string }>) {
  const resolvedErrorId = errorId ?? (fieldId ? `${fieldId}-error` : undefined);
  const control = isValidElement(children) && (fieldId || required || error)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
      ...(fieldId ? { id: fieldId } : {}),
      ...(required ? { "aria-required": true } : {}),
      ...(error ? { "aria-invalid": true, "aria-describedby": resolvedErrorId } : {})
    })
    : children;
  return (
    <label className={`form-field${error ? " has-error" : ""}`}>
      <FieldLabel label={label} required={required} />
      {control}
      {error ? <span id={resolvedErrorId} className="field-error" role="alert">{error}</span> : null}
    </label>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

export function DataTable({ children }: PropsWithChildren) {
  return (
    <div className="table-wrap">
      <table className="data-table">{children}</table>
    </div>
  );
}

export function HeaderTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p className="section-copy">{subtitle}</p> : null}
      </div>
    </div>
  );
}
