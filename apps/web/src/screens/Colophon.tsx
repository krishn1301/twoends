import { COLOPHON, SIGNATURE, herLine, isHer } from '@twoends/core';

import { Monogram } from '../components/Monogram.tsx';
import { useSession } from '../state/session.ts';

/**
 * What this is — the promises, and who it was for.
 *
 * `docs/PRIVACY.md` already contains every guarantee on this page, and not one
 * user can read it. An app that promises "free forever, unpairing really
 * deletes, location is off by default" only in a repository is making those
 * promises to developers. This closes that, and it is the reason this page
 * exists at all rather than being a place to put a dedication.
 *
 * **Written fresh rather than imported.** PRIVACY.md is a threat model for
 * whoever maintains this; rendering it here would need a markdown renderer and
 * would put the words "restrictive select policy" in front of somebody's
 * girlfriend. The words live in `packages/core/content/dedication.json` with
 * everything else that is prose rather than interface, and a test asserts none
 * of that vocabulary has crept back in.
 *
 * The dedication is last, after the promises — where a book puts it, and the
 * final line of the page nobody reads to the end of.
 */
export function Colophon() {
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const forHer = isHer(profile?.id) ? herLine() : null;

  return (
    <div className="pb-4">
      <p className="text-[0.95rem] leading-relaxed">{COLOPHON.opening}</p>

      <div className="mt-7 flex flex-col gap-5">
        {COLOPHON.promises.map((promise) => (
          <div key={promise.title}>
            <h3 className="font-display text-[1.05rem] leading-tight font-semibold tracking-tight">
              {promise.title}
            </h3>
            <p className="text-ash mt-1.5 text-[0.9rem] leading-relaxed">{promise.body}</p>
          </div>
        ))}
      </div>

      <hr className="my-8 border-white/10" />

      <div className="flex flex-col items-center text-center">
        <Monogram
          mine={profile?.display_name}
          theirs={partner?.display_name}
          myAccent={profile?.accent_key}
          theirAccent={partner?.accent_key}
          size={64}
        />

        {/*
          The mark is initials rather than a name, by instruction: "not my name —
          both of ours". It is also the only string in the app that is about one
          particular pair of people, which is why it is two letters and a word.
        */}
        <p className="counter mt-4 text-sm tracking-[0.32em] uppercase">{SIGNATURE.mark}</p>
        <p className="text-ash mt-2 text-[0.85rem] leading-relaxed">{SIGNATURE.line}</p>
        <p className="text-ash/60 mt-1 text-[0.75rem]">{SIGNATURE.year}</p>

        {/*
          One sentence, for one reader. Everybody else's page ends on the line
          above and looks finished there — which is the point of putting it last
          rather than making room for it.
        */}
        {forHer && (
          <p className="mt-6 max-w-[22rem] text-[0.9rem] leading-relaxed italic">{forHer}</p>
        )}
      </div>
    </div>
  );
}
