export function Spinner({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <span role="status" className={`inline-flex items-center gap-3 ${className}`}>
      <span
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-primary-soft border-t-primary"
      />
      {label ? <span className="text-muted">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
