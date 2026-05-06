import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean;
}

export function Card({ noPadding = false, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={[
        "bg-gray-50 dark:bg-gray-900",
        "border border-gray-200 dark:border-gray-800",
        "rounded-xl",
        noPadding ? "" : "p-6",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
