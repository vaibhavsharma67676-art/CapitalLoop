import { useEffect, useState } from 'react';

export function useCountdownSeconds(deadlineAt: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (!deadlineAt) return null;
    return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!deadlineAt) {
      setRemaining(null);
      return;
    }

    const update = () => {
      setRemaining(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [deadlineAt]);

  return remaining;
}