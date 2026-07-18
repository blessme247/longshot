import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

type Tick = "shortened" | "drifted" | null;

const FLASH_MS = 600;

export function OddsTicker({
  value,
  color,
  className,
}: {
  value: number;
  color: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const prev = useRef(value);
  const [tick, setTick] = useState<Tick>(null);

  useEffect(() => {
    if (value === prev.current || reduced) {
      prev.current = value;
      return;
    }
    setTick(value < prev.current ? "shortened" : "drifted");
    prev.current = value;
    const t = setTimeout(() => setTick(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [value, reduced]);

  return (
    <span
      className={cn(
        "font-condensed font-bold tabular-nums transition-colors duration-300",
        className,
      )}
      style={{
        color: tick === "shortened" ? "var(--win)" : tick === "drifted" ? "var(--loss)" : color,
      }}
    >
      {value.toFixed(2)}x
    </span>
  );
}
