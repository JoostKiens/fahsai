export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse [animation-duration:1.2s] bg-zinc-700 rounded ${className ?? ''}`}
    />
  );
}
