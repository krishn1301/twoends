import { useEffect, useState } from 'react';

import { getAccent, isDrawing, recapTitle, type Drawing } from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { DrawSurface } from '../components/DrawSurface.tsx';
import { BackButton, Button } from '../components/Field.tsx';
import { signedUrls } from '../db/photos.ts';
import { recapContents, type Recap as RecapRow, type RecapContents } from '../db/recap.ts';
import { useChrome } from '../design/version.ts';
import { drawRecap } from '../lib/recapImage.ts';
import { saveFile } from '../lib/saveFile.ts';
import { useSession } from '../state/session.ts';

/**
 * A month, whole.
 *
 * The rest of the app is deliberately short-sighted — twelve snaps in the feed,
 * one card a day, a question that expires at midnight — and this is the one
 * place that is not. Coming back to photographs you have not seen for three
 * weeks is the entire point, and it only works because the feed does not
 * already show them.
 *
 * Rendered live from the tables, never from a stored copy. The window is the
 * only thing the recap row holds, so this page in five years shows what the
 * month actually contained rather than what somebody's export happened to
 * catch — which is also why photographs stop expiring the moment a recap claims
 * them.
 */
export function Recap({ recap, onClose }: { recap: RecapRow; onClose: () => void }) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;
  const chrome = useChrome(mine);

  const [contents, setContents] = useState<RecapContents | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const coupleId = couple?.id;
    if (!coupleId) return;

    let alive = true;
    void (async () => {
      const found = await recapContents(
        coupleId,
        { month: recap.month, from: recap.from_date, to: recap.to_date },
        couple.started_on,
      );
      if (!alive) return;
      setContents(found);

      // The diptychs live in the same bucket, so they sign in the same batch.
      const signed = await signedUrls([
        ...found.photos.map((photo) => photo.storage_path),
        ...found.moments.flatMap((day) => day.shots.map((shot) => shot.storage_path)),
      ]);
      if (alive) setUrls(signed);
    })();

    return () => {
      alive = false;
    };
  }, [couple?.id, couple?.started_on, recap.month, recap.from_date, recap.to_date]);

  const nameOf = (id: string): string =>
    id === profile?.id ? (profile?.display_name ?? 'you') : (partner?.display_name ?? 'them');
  const accentOf = (id: string): string => (id === profile?.id ? mine : theirs);

  async function save() {
    if (!contents) return;

    setSaving(true);
    setSaved(null);

    const blob = await drawRecap({
      month: recap.month,
      daysTogether: contents.daysTogether,
      daysAnswered: contents.daysAnswered,
      photos: [
        ...contents.photos.map((photo) => ({
          url: urls.get(photo.storage_path),
          caption: photo.caption,
        })),
        /*
          The diptychs belong in the poster too. They were signed in the same
          batch as the snaps and then only ever shown on screen — a month that
          contained four "same thing, same time" pairs and did not put one of
          them in the picture it exports is not a recap of that month.
        */
        ...contents.moments.flatMap((day) =>
          day.shots.map((shot) => ({ url: urls.get(shot.storage_path), caption: day.prompt })),
        ),
      ].filter((p): p is { url: string; caption: string | null } => typeof p.url === 'string'),
      /*
        And the canvases. `recapContents` has always fetched them and the
        poster never had a field to put them in, which is why "save as image"
        produced a page of questions and answers and nothing else.
      */
      drawings: contents.drawings
        .map((row) => row.strokes as Drawing)
        .filter(isDrawing)
        .map((drawing) => drawing.strokes),
      closest: contents.closest
        ? {
            question: contents.closest.question,
            answers: contents.closest.answers.map((a) => a.body),
          }
        : null,
      furthest: contents.furthest
        ? {
            question: contents.furthest.question,
            answers: contents.furthest.answers.map((a) => a.body),
          }
        : null,
      names: [profile?.display_name ?? 'you', partner?.display_name ?? 'them'],
      accents: [mine, theirs],
      mark: 'twoends',
    });

    if (!blob) {
      setSaved('Could not draw it.');
      setSaving(false);
      return;
    }

    const { location, error } = await saveFile(blob, `twoends-${recap.month.slice(0, 7)}.png`);
    setSaved(error ?? (location ? `Saved to ${location}` : 'Saved'));
    setSaving(false);
  }

  return (
    <div className="bg-void text-chalk min-h-full px-5 pt-6 pb-32">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6 flex items-center gap-2">
          <BackButton onClick={onClose} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-2xl font-semibold tracking-tight">
              {recapTitle(recap.month)}
            </h1>
            <p className="text-ash text-sm">{monthSpan(recap.from_date, recap.to_date)}</p>
          </div>
        </header>

        {!contents ? (
          <p className="text-ash py-10 text-center text-sm">Putting the month together…</p>
        ) : (
          <>
            {/* The two numbers, before anything that needs reading. */}
            <div
              className="mb-8 rounded-[28px] p-5"
              style={{ background: `linear-gradient(145deg, ${mine}, ${theirs})` }}
            >
              <p className="counter text-[2.2rem] leading-none font-medium text-white">
                {contents.daysTogether.toLocaleString('en-GB')}
              </p>
              <p className="mt-2 text-[0.6rem] tracking-[0.2em] text-white/90 uppercase">
                days together by the end of it
              </p>
              <p className="mt-3 text-[0.9rem] text-white/90">
                {contents.daysAnswered === 1
                  ? 'One day you both answered.'
                  : `${contents.daysAnswered} days you both answered.`}
              </p>
            </div>

            {contents.photos.length > 0 && (
              <section className="mb-8 flex flex-col gap-4">
                {contents.photos.map((photo) => {
                  const url = urls.get(photo.storage_path);
                  return (
                    <figure key={photo.id} className="bg-surface overflow-hidden rounded-[28px]">
                      {url ? (
                        <img
                          src={url}
                          alt={photo.caption ?? 'A snap from this month'}
                          className="w-full object-cover"
                        />
                      ) : (
                        <div className="bg-surface-2 h-64 w-full" />
                      )}
                      <figcaption className="flex items-center gap-2.5 px-5 py-4">
                        <Avatar
                          name={nameOf(photo.author_id)}
                          accent={accentOf(photo.author_id)}
                          size={22}
                        />
                        <span className="text-ash min-w-0 flex-1 truncate text-sm">
                          {photo.caption ?? dayOf(photo.created_at)}
                        </span>
                      </figcaption>
                    </figure>
                  );
                })}
              </section>
            )}

            {contents.drawings.length > 0 && (
              <section className="mb-8">
                <h2 className="text-ash mb-3 text-xs tracking-[0.18em] uppercase">Drawn</h2>
                <div className="flex flex-col gap-3">
                  {contents.drawings.map((row) => {
                    const drawing = row.strokes as Drawing;
                    if (!isDrawing(drawing)) return null;
                    return (
                      <div key={row.id} className="bg-surface h-48 rounded-[28px] p-3">
                        <DrawSurface
                          readOnly
                          color={accentOf(row.author_id)}
                          drawing={drawing}
                          className="h-full"
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {contents.moments.length > 0 && (
              <section className="mb-8">
                <h2 className="text-ash mb-3 text-xs tracking-[0.18em] uppercase">
                  Same thing, same time
                </h2>
                <div className="flex flex-col gap-4">
                  {contents.moments.map((day) => (
                    <div key={day.date} className="bg-surface lift rounded-[28px] p-4">
                      <p className="font-display text-[1.05rem] leading-snug font-semibold">
                        {day.prompt}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {day.shots.map((shot) => (
                          <div
                            key={shot.id}
                            className="aspect-square overflow-hidden rounded-2xl"
                            style={{ boxShadow: `inset 0 0 0 2px ${accentOf(shot.author_id)}` }}
                          >
                            <img
                              src={urls.get(shot.storage_path)}
                              alt={nameOf(shot.author_id)}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                      <p className="text-ash mt-2 text-xs">{dayOf(`${day.date}T12:00:00Z`)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {contents.closest && (
              <Exchange
                title={contents.furthest ? 'Closest' : 'The one worth keeping'}
                exchange={contents.closest}
                nameOf={nameOf}
                accentOf={accentOf}
              />
            )}

            {contents.furthest && (
              <Exchange
                title="Furthest apart"
                exchange={contents.furthest}
                nameOf={nameOf}
                accentOf={accentOf}
              />
            )}

            {contents.capsules.length > 0 && (
              <section className="mb-8">
                <h2 className="text-ash mb-3 text-xs tracking-[0.18em] uppercase">Opened</h2>
                <div className="flex flex-col gap-3">
                  {contents.capsules.map((capsule) => (
                    <div key={capsule.id} className="bg-surface rounded-[28px] p-5">
                      <div className="mb-2 flex items-center gap-2.5">
                        <Avatar
                          name={nameOf(capsule.author_id)}
                          accent={accentOf(capsule.author_id)}
                          size={22}
                        />
                        <span className="text-ash text-xs">{dayOf(capsule.deliver_at)}</span>
                      </div>
                      <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap">
                        {capsule.body}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {contents.arrived.length > 0 && (
              <section className="mb-8">
                <h2 className="text-ash mb-3 text-xs tracking-[0.18em] uppercase">Arrived</h2>
                <div className="flex flex-col gap-3">
                  {contents.arrived.map((row) => (
                    <div
                      key={row.id}
                      className="bg-surface flex items-center gap-4 rounded-3xl px-5 py-4"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{row.title}</span>
                        <span className="text-ash text-sm">{dayOf(row.target_at)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="mt-10 flex flex-col gap-2.5">
              <Button type="button" accent={chrome} disabled={saving} onClick={() => void save()}>
                {saving ? 'Drawing it…' : 'Save as image'}
              </Button>
              {saved && <p className="text-ash text-center text-sm">{saved}</p>}
              <p className="text-ash mt-2 text-center text-[0.8rem] leading-relaxed">
                Every photograph in here is kept for good. Nothing in a recap ever expires.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Exchange({
  title,
  exchange,
  nameOf,
  accentOf,
}: {
  title: string;
  exchange: { question: string; answers: { author_id: string; body: string }[] };
  nameOf: (id: string) => string;
  accentOf: (id: string) => string;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-ash mb-3 text-xs tracking-[0.18em] uppercase">{title}</h2>
      <div className="bg-surface rounded-[28px] p-5">
        <p className="font-display text-[1.15rem] leading-snug font-semibold">
          {exchange.question}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {exchange.answers.map((answer) => (
            <div
              key={answer.author_id}
              className="rounded-2xl p-4 pl-5"
              style={{
                background: 'rgba(0,0,0,0.28)',
                boxShadow: `inset 3px 0 0 ${accentOf(answer.author_id)}`,
              }}
            >
              <p className="mb-1.5 text-xs" style={{ color: accentOf(answer.author_id) }}>
                {nameOf(answer.author_id)}
              </p>
              <p className="text-[0.98rem] leading-relaxed whitespace-pre-wrap">{answer.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** "17 July – 16 August", which is what the window actually was. */
function monthSpan(from: string, to: string): string {
  const day = (date: string): string =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  return `${day(from)} – ${day(to)}`;
}

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
