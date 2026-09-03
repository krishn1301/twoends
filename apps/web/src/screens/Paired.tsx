import { useEffect } from 'react';

import { getAccent } from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { Monogram } from '../components/Monogram.tsx';
import { useAvatars } from '../state/avatars.ts';
import { useSession } from '../state/session.ts';

/** How long the whole thing takes, matched to `.pair-line` in `theme.css`. */
const RUNS_FOR = 2600;

/**
 * The moment it becomes a two-person app.
 *
 * **Item 7 of the visual review.** The inviter's waiting screen became Home
 * with no transition at all, and the joiner was shown "You and Ravi are
 * paired." and then, immediately, a form asking for an email address. The one
 * event the whole first hour is building toward was spent on a text input.
 *
 * Nothing new is invented here: it is the two circles and the dashed line from
 * the "It takes two" screen, closing, and the mark those two people make
 * together taking their place. Both sides see it, because both sides were
 * waiting.
 *
 * It gets out of the way on its own after two and a half seconds, and a tap
 * skips it. A celebration you have to dismiss is a dialog.
 */
export function Paired({ onDone }: { onDone: () => void }) {
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const urls = useAvatars((s) => s.urls);
  const loadAvatars = useAvatars((s) => s.load);

  useEffect(() => {
    void loadAvatars([profile?.avatar_path, partner?.avatar_path]);
  }, [loadAvatars, profile?.avatar_path, partner?.avatar_path]);

  useEffect(() => {
    const timer = window.setTimeout(onDone, RUNS_FOR);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  const myName = profile?.display_name ?? 'you';
  const theirName = partner?.display_name ?? 'them';

  // Their own colours, because the mark they resolve into is made of these two.
  const mine = getAccent(profile?.accent_key).onDark;
  const theirs = getAccent(partner?.accent_key).onDark;

  return (
    <button
      type="button"
      onClick={onDone}
      aria-label="Continue"
      /*
        `fixed inset-0` rather than `min-h-full`, and not a matter of taste:
        theme.css sets `button, a, [role='button'] { min-height: 44px }` as
        plain CSS after the utilities, so on a `<button>` it beats `min-h-full`
        at equal specificity and the whole reveal renders in a 44px strip at the
        top of the screen. Anything full-screen built on a button has this.
      */
      className="bg-void text-chalk fixed inset-0 z-50 flex w-full flex-col items-center justify-center px-8"
    >
      <div className="relative grid h-32 w-full max-w-xs place-items-center">
        <div className="pair-faces absolute inset-0 flex items-center justify-center">
          <span className="pair-close-left">
            <Avatar
              name={myName}
              accent={mine}
              size={72}
              src={profile?.avatar_path ? urls.get(profile.avatar_path) : null}
            />
          </span>
          <span
            className="pair-thread mx-3 w-16 border-t border-dashed border-white/35"
            aria-hidden="true"
          />
          <span className="pair-close-right">
            <Avatar
              name={theirName}
              accent={theirs}
              size={72}
              src={partner?.avatar_path ? urls.get(partner.avatar_path) : null}
            />
          </span>
        </div>

        <span className="pair-mark inline-flex">
          <Monogram
            mine={myName}
            theirs={theirName}
            myAccent={profile?.accent_key}
            theirAccent={partner?.accent_key}
            size={128}
          />
        </span>
      </div>

      <p className="pair-line font-display mt-8 text-center text-[1.6rem] leading-tight font-semibold tracking-tight">
        {myName} and {theirName}.
      </p>
      <p className="pair-line text-ash mt-2 text-center text-[0.95rem]">One shared space, now.</p>
    </button>
  );
}
