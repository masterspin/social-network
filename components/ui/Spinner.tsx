type Size = "sm" | "md" | "lg";

interface SpinnerProps {
  size?: Size;
  className?: string;
}

const sizeClasses: Record<Size, string> = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-10 h-10 border-[3px]",
};

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <div
      className={[
        "rounded-full animate-spin",
        "border-gray-200 dark:border-gray-700",
        "border-t-gray-700 dark:border-t-gray-200",
        sizeClasses[size],
        className,
      ].join(" ")}
      role="status"
      aria-label="Loading"
    />
  );
}
