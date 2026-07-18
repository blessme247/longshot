import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

export function CountUp({ to, className }: { to: number; className?: string }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? to : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(to);
      return;
    }
    const controls = animate(0, to, {
      duration: 1,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [to, reduced]);

  return <span className={className}>{display}</span>;
}
