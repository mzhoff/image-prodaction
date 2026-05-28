'use client';

import { useEffect, useState } from 'react';

export function OpenRouterBalance() {
  const [balance, setBalance] = useState<{
    limit: number | null;
    remaining: number | null;
    usedToday: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBalance() {
      try {
        const response = await fetch('/api/ai/balance', { cache: 'no-store' });
        if (!response.ok) return;
        const result = await response.json() as {
          limit: number | null;
          remaining: number | null;
          usedToday: number | null;
        };
        if (!cancelled) setBalance(result);
      } catch {
        if (!cancelled) setBalance(null);
      }
    }

    void loadBalance();
    const interval = window.setInterval(loadBalance, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!balance) return null;

  return (
    <div className="openrouter-balance">
      <div>
        <span>Остаток</span>
        <strong>{formatMoney(balance.remaining)}</strong>
      </div>
      <div>
        <span>Лимит</span>
        <strong>{formatMoney(balance.limit)}</strong>
      </div>
      <div>
        <span>Сегодня</span>
        <strong>{formatMoney(balance.usedToday)}</strong>
      </div>
    </div>
  );
}

function formatMoney(value: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `$${value.toFixed(4)}`;
}
