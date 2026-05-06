type Size = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: Size;
  className?: string;
}

const sizeMap: Record<Size, { px: string; text: string }> = {
  xs: { px: "w-6 h-6", text: "text-[10px]" },
  sm: { px: "w-8 h-8", text: "text-xs" },
  md: { px: "w-10 h-10", text: "text-sm" },
  lg: { px: "w-20 h-20", text: "text-2xl" },
  xl: { px: "w-32 h-32", text: "text-4xl" },
};

function getColor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  const hue = (sum * 137) % 360;
  return `hsl(${hue}, 55%, 52%)`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({ name, imageUrl, size = "md", className = "" }: AvatarProps) {
  const { px, text } = sizeMap[size];
  const base = `${px} rounded-full flex-shrink-0 object-cover ${className}`;

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        className={`${base} border border-gray-200 dark:border-gray-700`}
      />
    );
  }

  return (
    <div
      className={`${base} flex items-center justify-center text-white font-semibold select-none`}
      style={{ backgroundColor: getColor(name) }}
      aria-label={name}
    >
      <span className={text}>{getInitials(name)}</span>
    </div>
  );
}
