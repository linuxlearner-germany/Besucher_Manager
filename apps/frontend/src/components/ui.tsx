import { type PropsWithChildren, type ReactNode } from "react";

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
  return <div className={`feedback ${type}`}>{children}</div>;
}

export function FormField({
  label,
  required,
  error,
  children
}: PropsWithChildren<{ label: string; required?: boolean; error?: string }>) {
  return (
    <label>
      {label}{required ? " *" : ""}
      {children}
      {error ? <span className="field-error">{error}</span> : null}
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
