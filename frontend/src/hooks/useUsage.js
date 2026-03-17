import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';

const LIMITS = { scans: 10, options: 5 };
const BASE   = import.meta.env.VITE_API_BASE;

export function useUsage() {
  const { user }  = useUser();
  const userId    = user?.id || 'guest';
  const [usage, setUsage] = useState({ scans: 0, options: 0 });

  useEffect(() => {
    if (!user) return;
    fetch(`${BASE}/usage/${userId}`)
      .then(r => r.json())
      .then(data => setUsage(data))
      .catch(() => {});
  }, [userId, user]);

  const refreshUsage = async () => {
    if (!user) return;
    try {
      const res  = await fetch(`${BASE}/usage/${userId}`);
      const data = await res.json();
      setUsage(data);
    } catch {}
  };

  const canScan    = () => usage.scans   < LIMITS.scans;
  const canOptions = () => usage.options < LIMITS.options;

  const trackScan = async () => {
    try {
      const res  = await fetch(`${BASE}/usage/${userId}/track`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'scan' }),
      });
      const data = await res.json();
      setUsage(data);
    } catch {
      setUsage(u => ({ ...u, scans: u.scans + 1 }));
    }
  };

  const trackOptions = async () => {
    try {
      const res  = await fetch(`${BASE}/usage/${userId}/track`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'options' }),
      });
      const data = await res.json();
      setUsage(data);
    } catch {
      setUsage(u => ({ ...u, options: u.options + 1 }));
    }
  };

  return { usage, limits: LIMITS, canScan, canOptions, trackScan, trackOptions, refreshUsage };
}