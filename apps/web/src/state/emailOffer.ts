const KEY = 'twoends.email-offered';

/**
 * Whether this device has already been offered the fire escape.
 *
 * Device-local on purpose: an anonymous account *is* this browser, so the
 * question "have we asked yet" belongs to the browser too.
 */
export function emailOffered(): boolean {
  try {
    return localStorage.getItem(KEY) === 'yes';
  } catch {
    // Private browsing. Treat as already asked rather than nagging on a device
    // that cannot remember the answer.
    return true;
  }
}

export function markEmailOffered(): void {
  try {
    localStorage.setItem(KEY, 'yes');
  } catch {
    // Being asked twice is a smaller failure than crashing.
  }
}
