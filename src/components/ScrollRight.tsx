"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Wraps a horizontally-scrollable container and starts it scrolled all the
// way right (e.g. so the most recent month is visible without swiping) —
// a no-op on wide screens where there's nothing to scroll.
export default function ScrollRight({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollLeft = ref.current.scrollWidth;
    }
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
