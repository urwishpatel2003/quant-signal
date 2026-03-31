import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';

const FREE_LIMITS = { scans: 10, options: 5 };
const PRO_LIMITS  = { scans: 999, options: 999 };
const BASE        = import.meta.env.VITE_API_BASE;

export function useUsage() {
  const { user }  = useUser();
  const userId    = user?.id || 'guest';
  const [usage,   setUsage]   = useState({ scans: 0, options: 0 });
  const [plan,    setPlan]    = useState('free');

  useEffect(() => {
    if (!user) return;
    fetch(`${BASE}/usage/${userId}`)
      .then(r => r.json())
      .then(data => {
        setUsage({ scans: data.scans || 0, options: data.options || 0 });
        setPlan(data.plan || 'free');
      })
      .catch(() => {});
  }, [userId, user]);

  const refreshUsage = async () => {
    if (!user) return;
    try {
      const res  = await fetch(`${BASE}/usage/${userId}`);
      const data = await res.json();
      setUsage({ scans: data.scans || 0, options: data.options || 0 });
      setPlan(data.plan || 'free');
    } catch {}
  };

  const limits     = plan === 'pro' ? PRO_LIMITS : FREE_LIMITS;
  const canScan    = () => plan === 'pro' || usage.scans   < FREE_LIMITS.scans;
  const canOptions = () => plan === 'pro' || usage.options < FREE_LIMITS.options;

  const trackScan = async () => {
    try {
      const res  = await fetch(`${BASE}/usage/${userId}/track`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'scan' }),
      });
      const data = await res.json();
      setUsage({ scans: data.scans || 0, options: data.options || 0 });
      setPlan(data.plan || plan);
    } catch { setUsage(u => ({ ...u, scans: u.scans + 1 })); }
  };

  const trackOptions = async () => {
    try {
      const res  = await fetch(`${BASE}/usage/${userId}/track`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'options' }),
      });
      const data = await res.json();
      setUsage({ scans: data.scans || 0, options: data.options || 0 });
      setPlan(data.plan || plan);
    } catch { setUsage(u => ({ ...u, options: u.options + 1 })); }
  };

  return { usage, limits, plan, canScan, canOptions, trackScan, trackOptions, refreshUsage };
}