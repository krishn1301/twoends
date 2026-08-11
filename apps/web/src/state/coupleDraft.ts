import type { RelationshipType } from './session.ts';

/**
 * Onboarding asks two questions about the *couple* — what you are to each other,
 * and when it started — before a couple exists to hang them on. The row is only
 * created when you go to pair.
 *
 * So the answers wait here, in local storage, and are applied the moment the row
 * appears. The alternative, creating the couple during onboarding, meant calling
 * `create_invite` purely for its side effect and minting an invite code nobody
 * asked for.
 *
 * Local storage rather than component state because onboarding and pairing are
 * separate screens and, for someone who closes the app in between, separate
 * sessions.
 */

const KEY = 'twoends.couple-draft';

export interface CoupleDraft {
  relationship_type: RelationshipType | null;
  started_on: string | null;
}

export function stashCoupleDraft(draft: CoupleDraft): void {
  if (draft.relationship_type === null && draft.started_on === null) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private browsing, quota, a locked-down webview. Losing two optional
    // answers is not worth breaking onboarding over.
  }
}

export function takeCoupleDraft(): CoupleDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    return JSON.parse(raw) as CoupleDraft;
  } catch {
    return null;
  }
}
