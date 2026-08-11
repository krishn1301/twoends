import { useState } from 'react';

import { ACCENTS, ACCENT_KEYS, type AccentKey } from '@twoends/core';

import { BackButton, Button, Field, Progress, TextInput } from '../components/Field.tsx';
import { supabase } from '../lib/supabase.ts';
import { stashCoupleDraft } from '../state/coupleDraft.ts';
import { useSession, type RelationshipType } from '../state/session.ts';

/**
 * Five questions, one of which is required.
 *
 * These come *first* — before any account, any email, any wall. Someone who has
 * just been told about this app should be answering questions about their
 * relationship within seconds of opening it, not proving who they are to a
 * service they have no reason to trust yet. The account already exists,
 * anonymously, made in the background.
 *
 * Every step but the name has a visible Skip, Back always works, and the
 * progress bar counts all five whether or not you answer them — a bar that only
 * counts what you filled in lurches forward and stops meaning anything.
 */

const RELATIONSHIPS: Array<{ key: RelationshipType; label: string; hint: string }> = [
  { key: 'together', label: 'Together', hint: 'Same city, same life' },
  { key: 'long_distance', label: 'Long distance', hint: 'Different cities or countries' },
  { key: 'situationship', label: 'A situationship', hint: 'Undefined, on purpose' },
  { key: 'friends', label: 'Close friends', hint: 'Not romantic, still ours' },
  { key: 'complicated', label: "It's complicated", hint: 'The honest answer' },
];

const TOTAL_STEPS = 5;

export function Onboarding() {
  const refresh = useSession((s) => s.refresh);
  const session = useSession((s) => s.session);
  const beginSignIn = useSession((s) => s.beginSignIn);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [accent, setAccent] = useState<AccentKey>('teal');
  const [relationship, setRelationship] = useState<RelationshipType | null>(null);
  const [startedOn, setStartedOn] = useState('');
  const [birthday, setBirthday] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tint = ACCENTS[accent].onDark;
  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  async function finish() {
    if (!session) return;
    setBusy(true);
    setError(null);

    const { error: profileError } = await supabase.from('profiles').insert({
      id: session.user.id,
      display_name: name.trim(),
      accent_key: accent,
      birthday: birthday || null,
    });

    if (profileError) {
      setBusy(false);
      setError(profileError.message);
      return;
    }

    // These two describe the couple, which does not exist yet — its row is
    // created when they go to pair. Park them until it does.
    stashCoupleDraft({ relationship_type: relationship, started_on: startedOn || null });

    setBusy(false);
    await refresh();
  }

  return (
    <div className="bg-void text-chalk flex min-h-full flex-col px-6 pt-6 pb-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <div className="mb-8 flex items-center gap-3">
          {step > 0 ? <BackButton onClick={back} /> : <span className="h-11 w-11" />}
          <Progress step={step + 1} total={TOTAL_STEPS} accent={tint} />
        </div>

        <div className="flex flex-1 flex-col">
          {step === 0 && (
            <Step
              title="What should they call you?"
              sub="A name, a petname, whatever they actually say."
            >
              <Field label="Name" error={error}>
                <TextInput
                  autoFocus
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aarav"
                />
              </Field>
            </Step>
          )}

          {step === 1 && (
            <Step
              title="Pick your colour."
              sub="Anything you make shows up in this. Anything they make shows up in theirs."
            >
              <div className="grid grid-cols-4 gap-3">
                {ACCENT_KEYS.map((key) => {
                  const a = ACCENTS[key];
                  const selected = key === accent;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAccent(key)}
                      aria-pressed={selected}
                      aria-label={a.label}
                      className="flex flex-col items-center gap-2"
                    >
                      <span
                        className="h-14 w-14 rounded-full transition-transform"
                        style={{
                          background: a.onDark,
                          boxShadow: selected ? '0 0 0 3px #F2EDE9' : 'none',
                          transform: selected ? 'scale(1.06)' : 'none',
                        }}
                      />
                      <span className="text-ash text-[0.7rem]">{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </Step>
          )}

          {step === 2 && (
            <Step title="What are you two?" sub="Changes the words, never the features.">
              <div className="flex flex-col gap-2.5">
                {RELATIONSHIPS.map((r) => (
                  <Choice
                    key={r.key}
                    label={r.label}
                    hint={r.hint}
                    selected={relationship === r.key}
                    tint={tint}
                    onClick={() => setRelationship(r.key)}
                  />
                ))}
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step title="When did it start?" sub="The counter runs from here.">
              <Field label="Your date" hint="Optional, and easy to change later.">
                <TextInput
                  type="date"
                  value={startedOn}
                  onChange={(e) => setStartedOn(e.target.value)}
                />
              </Field>
            </Step>
          )}

          {step === 4 && (
            <Step title="When is your birthday?" sub="So neither of you has to remember alone.">
              <Field label="Birthday" hint="Optional." error={error}>
                <TextInput
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                />
              </Field>
            </Step>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-2">
          {step < TOTAL_STEPS - 1 ? (
            <>
              <Button
                accent={tint}
                onClick={next}
                disabled={step === 0 && name.trim().length === 0}
              >
                Continue
              </Button>
              {step > 0 && (
                <Button variant="quiet" accent={tint} onClick={next}>
                  Skip
                </Button>
              )}
            </>
          ) : (
            <Button accent={tint} onClick={() => void finish()} disabled={busy}>
              {busy ? 'Saving…' : 'Done'}
            </Button>
          )}

          {/*
            The way back in. Without this, anyone reinstalling the app or moving
            to a new phone would be permanently locked out of an account that
            still exists — the single worst failure mode of anonymous-first.
          */}
          {step === 0 && (
            <button
              type="button"
              onClick={beginSignIn}
              className="text-ash mt-2 h-11 text-sm underline underline-offset-4"
            >
              I have used this before
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.9rem] leading-[1.15] font-semibold tracking-tight">
          {title}
        </h1>
        <p className="text-ash mt-2 text-[0.95rem] leading-relaxed">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function Choice({
  label,
  hint,
  selected,
  tint,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  tint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex flex-col items-start rounded-2xl px-4 py-3.5 text-left transition-colors"
      style={{
        background: selected ? `color-mix(in oklab, ${tint} 22%, #15120F)` : 'var(--color-surface)',
        boxShadow: selected ? `inset 0 0 0 1.5px ${tint}` : 'none',
      }}
    >
      <span className="font-medium">{label}</span>
      {hint && <span className="text-ash text-sm">{hint}</span>}
    </button>
  );
}
