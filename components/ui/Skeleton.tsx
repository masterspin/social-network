interface SkeletonProps {
  className?: string;
}

const base = "animate-pulse bg-gray-200 dark:bg-gray-700 rounded";

export function SkeletonText({ className = "" }: SkeletonProps) {
  return <div className={`${base} h-4 ${className}`} />;
}

export function SkeletonAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = { sm: "w-8 h-8", md: "w-10 h-10", lg: "w-20 h-20" }[size];
  return <div className={`${base} rounded-full ${s}`} />;
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div
      className={[
        "bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6",
        className,
      ].join(" ")}
    >
      <div className="flex items-start gap-3 mb-4">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <SkeletonText className="w-1/3" />
          <SkeletonText className="w-1/4" />
        </div>
      </div>
      <SkeletonText className="w-full mb-2" />
      <SkeletonText className="w-3/4" />
    </div>
  );
}
