type Variant = "first" | "onePointFive" | "pending" | "success" | "error";

interface BadgeProps {
  variant: Variant;
  children?: React.ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  first:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  onePointFive:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  pending:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  success:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  error:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const defaultLabels: Record<Variant, string> = {
  first: "1st",
  onePointFive: "1.5",
  pending: "Pending",
  success: "Success",
  error: "Error",
};

export function Badge({ variant, children, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {children ?? defaultLabels[variant]}
    </span>
  );
}

export function connectionTypeBadge(type: "first" | "one_point_five") {
  return type === "first" ? "first" : "onePointFive";
}
