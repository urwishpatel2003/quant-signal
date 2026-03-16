import { useUser } from '@clerk/clerk-react';

const LIMITS = { scans: 5, options: 3 };

function getKey(userId) {
  const today = new Date().toISOString().split('T')[0];
  return `qs_usage_${userId}_${today}`;
}

function getUsage(userId) {
  try {
    const raw = localStorage.getItem(getKey(userId));
    return raw ? JSON.parse(raw) : { scans: 0, options: 0 };
  } catch { return { scans: 0, options: 0 }; }
}

function saveUsage(userId, usage) {
  try { localStorage.setItem(getKey(userId), JSON.stringify(usage)); }
  catch {}
}

export function useUsage() {
  const { user } = useUser();
  const userId   = user?.id || 'guest';

  const getCount = () => getUsage(userId);

  const canScan    = () => getUsage(userId).scans   < LIMITS.scans;
  const canOptions = () => getUsage(userId).options < LIMITS.options;

  const trackScan = () => {
    const u = getUsage(userId);
    saveUsage(userId, { ...u, scans: u.scans + 1 });
  };

  const trackOptions = () => {
    const u = getUsage(userId);
    saveUsage(userId, { ...u, options: u.options + 1 });
  };

  const usage  = getCount();
  const limits = LIMITS;

  return { usage, limits, canScan, canOptions, trackScan, trackOptions };
}