export function StatusBadge({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "info";
}) {
  return <span className={`status-${tone}-v80`}>{children}</span>;
}
