# TwoEnds — proposed visual changes

> Screenshots for every item are in the review page:
> https://claude.ai/code/artifact/23f39ef8-b024-4756-9ee3-1da5d4d1abd7
> This file is the version to hand to a coding session; the page is the version
> to approve or cut items from.

Reviewed on the live site, 3 Sep 2026, at 360×740, on a **fresh anonymous pair**
created for this review (Ravi + Meera, and a third account, Ishaan, to check what
a different accent does to the interface). Krishn's own account was not touched:
nothing was unpaired, deleted or signed into.

What this covers that the earlier screenshot pass could not: onboarding, the
pairing handshake from both sides, and every empty state in the app.

Ordered by visible difference per unit of work. Items 1–5 are the ones worth
doing whatever else gets cut.

---

## The short version

The app reads sober for three reasons that measure, not three that are matters of taste.

1. **The elevation system is optically flat.** `--color-void` #000 → `--color-surface`
   #15120F is **1.13:1**. `--color-surface` → `--color-surface-2` #201B17 is **1.09:1**.
   The hairline is 1.24:1 against a card. Three tokens describing one visible plane —
   which is why a settings row, a memory, a form field and the tab bar all read as the
   same object. Krishn's "one card style doing six jobs" is right, but the cause is the
   palette, not the component.

2. **The accent is the interface.** Confirmed live rather than inferred: a second
   account made during this review was assigned teal, and the entire app turned teal.
   Not just buttons and pills — the progress bar, Continue, Invite them, Share the code,
   every sub-tab pill, every category chip, the daily card's ground tint, the streak's
   "today" dot, the distance number, the day count on a Coming-up row, and the first
   swatch in the drawing palette. So "my colour" is currently indistinguishable from
   "the app's colour", and the best idea in the design cannot be read.

3. **Every empty state is the same three-part shape:** one full-width accent button, one
   grey sentence, then 400–500px of pure black. Snaps, Capsules, Memories, List, Coming
   up, Play. Nothing anywhere shows what the screen looks like once it has something in it.

And the pattern Krishn spotted holds: everything that already works is either **user
content shown large** or **the two colours used together**. The anniversary card, the
distance card, and — worth adding to the protected list — the This-or-that disagreement
state, where each option takes the colour of whoever picked it.

---

## 1. Split the accent in two: interface chrome, and the two people

**Screens:** all four tabs, onboarding, pairing.

**Now:** `mine` is used both as the interface colour and as the authorship colour. Every
control listed in point 2 above takes it. On Sansu's phone the app is a purple app; on
Krishn's it is a red app; and in both, "the colour that means me" is also "the colour
that means a button".

**Change:** introduce a third, fixed colour for interface chrome — everything a person
did not author. `mine` and `theirs` become reserved, strictly, for authorship: avatars,
the name above an answer, the two dots on the distance card, a Play pick, and the
gradient used when both are present.

**Why it makes the app more alive:** it is the only change here that makes every later
colour decision mean something. The moment a red thing on the screen is *always* Krishn,
the app starts telling you who is in the room.

**Where:** `apps/web/src/design/model.ts` for the token; every `tint = mine` /
`accent={mine}` call site in `Home.tsx`, `Play.tsx`, `Dates.tsx`, `Us.tsx`,
`Onboarding.tsx`, `Pair.tsx`, `Field.tsx`.

**Screenshot:** `onboarding-step1-teal.png` and `pair-code.png` (a teal account) beside
`dates-coming-up.png` (a cobalt account) — the same screens, re-skinned.

---

## 2. Make raised surfaces actually raised

**Screens:** all.

**Now:** void → surface is 1.13:1, surface → surface-2 is 1.09:1. A card is visible only
because of its corner radius.

**Change:** three legible levels — the page, something a person made, and something you
press. Either widen the luminance steps between the existing tokens, or keep the values
and give raised surfaces a top-edge highlight so the light has a direction. The comment
in `theme.css` about keeping the page true black for the OLED panel still holds; it is
the *cards* that need to lift off it.

**Why:** this is most of the sobriety, and it is one change in one file that every screen
inherits.

**Where:** `apps/web/src/styles/theme.css`.

---

## 3. Empty states: show the thing, don't describe it

**Screens:** Snaps sheet, Dates → Coming up / Memories / List / Capsules, Play → This or
that before either has picked.

**Now:** six screens, one shape: accent button, one line of grey, then black to the tab bar.

**Change:** one shared empty-state component that renders a **ghosted example of a filled
entry**, in the two accents, above the sentence that is already there — a dimmed memory
card with a placeholder date and both avatars, a sealed capsule with a lock and a future
date, an empty snap frame. Keep the copy; it is good.

**Why:** nobody has looked at this app empty, and empty is a new couple's entire first week.

**Screenshots:** `dates-capsules.png`, `snaps-empty.png`, `dates-coming-up.png`.

---

## 4. White-on-accent fails everywhere the two colours are used together

**Screen:** Home → Together rail, the anniversary card, and any `Tile` given a coloured `ground`.

**Now:** measured on a rose→iris gradient — the "DAY / HR / MIN / SEC" row (white at 70%,
9.6px) is **2.7:1**; the "anniversary" eyebrow (white at 60%) is **2.3:1**. On accents from
the lighter half of the picker — teal, citron, amber, moss — the same labels drop to
**1.6–1.9:1**, which is close to invisible. The accents themselves are engineered against
black and there is a test asserting it; nothing covers text placed *on top* of them.

**Change:** on an accent ground, labels take a solid colour chosen against that ground
rather than translucent white — or the label zone gets a scrim. `Tile` currently has two
ground cases (`onDark` true/false) and needs a third for "the ground is a full-strength accent".

**Why:** this is the liveliest card in the app, and the small labels are what make it read
as a counter rather than a number. It is also the fix that stops a citron+amber couple
getting a card they cannot read.

**Screenshot:** `home-rails.png`.

---

## 5. The distance card's number and its note collide

**Screen:** Home → Together rail.

**Now:** the number is pinned `right-4 bottom-14` at 1.6rem; the eyebrow + headline block
is pinned to the bottom of the tile with a two-line clamp. A two-line note — "km from
Sansu Baby" — grows upward into the number. The empty state has the mirror problem: the
headline truncates to "Turn on location to se…".

**Change:** give the tile an explicit three-zone layout — the two dots and the dotted line,
the number and its unit, the note — so the note cannot run under the number and the empty
headline can wrap to two lines.

**Screenshot:** `home-together-empty.png`.

---

## 6. Home's first screen is a finished question

**Screen:** Home.

**Now:** once both have answered, the daily card is still ~470px tall and fills the whole
first screen. Today does not begin until you scroll. There is nothing left to do on the
thing you are looking at.

**Change:** when both have answered, the card collapses to a compact resolved state — the
question, and both answers reachable in one tap — and Today and Together rise into the
first screen.

**Screenshot:** `home-both-answered.png`.

---

## 7. The pairing moment has no payoff

**Screens:** Pair (both sides).

**Now:** the inviter's waiting screen simply becomes Home, with no transition. The joiner
gets "You and Ravi are paired." immediately followed by an email-capture form with
*Save my account* and *Not now*. The one moment the app becomes a two-person app is spent
on a form.

**Change:** one short reveal, shown to both sides, built from what is already on the
"It takes two" screen — the two circles and the dotted line between them resolving into
the overlapping monogram — then Home. The email ask moves to a later, quieter moment.

**Screenshots:** `pair-ittakestwo.png`, `pair-code.png`.

---

## 8. The both-answered reveal happens silently

**Screen:** Home → daily card.

**Now:** the partner's answer arrives live and the card swaps content in place. Nothing
marks the moment the second answer lands — which is the single most anticipated event in
the app's day.

**Change:** the partner's block unfolds into place when it arrives. This is on the
sanctioned list in the brief.

---

## 9. Two answers, one surface

**Screen:** Home → daily card, both-answered state.

**Now:** both answer blocks are the same surface. The only thing separating them is a
12px name in the author's colour.

**Change:** each block carries its author's colour — a left edge, or a tint of the ground —
so a glance tells you whose is whose before you read a word.

**Screenshot:** `home-both-answered.png`.

---

## 10. Play's two picks are not symmetrical

**Screen:** Play → This or that, after both have picked.

**Now:** your pick gets an accent border, a tint and your avatar; theirs gets a tint and an
avatar but no border. It reads as "mine is selected and theirs is merely coloured" rather
than "we went two ways".

**Change:** symmetrical treatment for the two picks. Separately, the option nobody has
picked yet — before the reveal — is flat black and reads as dead; give it a surface that
says "this was the other one you could have chosen".

**Protect:** the two-colour reveal itself is one of the best things in the app.

**Screenshot:** `play-disagree.png`.

---

## 11. The week strip renders seven days as four and three

**Screen:** Home → Together rail, "this week" tile.

**Now:** the seven day markers sit in a four-column grid, so they wrap to 4 + 3 and read as
a broken calendar row.

**Change:** one row of seven at a smaller diameter.

**Screenshot:** `home-together-empty.png`.

---

## 12. Three permanent blocks of settings copy sit under the content

**Screens:** Home (bottom), every Play sub-tab.

**Now:** Home ends with two full prose cards — "Home-screen widgets are on Android for now"
and "Everything is already unlocked". Every Play sub-tab ends with the two-line 18+ line
(which is also `ash/70` on black — **3.43:1**, under the bar). These are read once and then
occupy the bottom of the app forever.

**Change:** one line each, or move them to Us and the Colophon, where the rest of the
promises already live.

**Screenshots:** `home-prose-cards.png`, `play-disagree.png`.

---

## 13. The monogram is used at 20px, and nowhere that matters

**Screens:** Us (bottom), Colophon.

**Now:** the two overlapping circles are the best mark in the app and appear at roughly
20px at the foot of the settings list, and at 64px on a page most people will never open.

**Change:** use it at the pairing moment (item 7), and as the cold-open state instead of a
blank black screen.

**Screenshot:** `us-bottom.png`.

---

## 14. Talk about and Know me? do not feel like decks

**Screen:** Play → Talk about, Know me?

**Now:** "Another" replaces the text in place; "1 / 5" is plain text above two buttons.
Nothing about either suggests a deck, which is what the copy says they are.

**Change:** a deal or a flip when Another is pressed and when a Know-me card advances; the
counter becomes a visible stack that shortens.

**Screenshots:** `play-talk.png`, `play-knowme.png`.

---

## 15. Placeholder text is 2.67:1

**Screens:** every form.

**Now:** `ash/60` on `surface-2`. The label above it is fine; the example text inside the
field is not.

**Change:** raise placeholders to clear 4.5:1.

---

# While I was in there — correctness, not taste

Not part of the ranked list; listed so they don't get lost.

- **"1 days".** The streak tile builds its headline as `${streak.current} days` with no
  singular case. The countdown tile two cards away does pluralise correctly.
  (`Home.tsx`, the "this week" `Tile`.)
- **"Nothing in common across 1, and still here."** Play's scoreboard line does not hold up
  at one card played. (`Play.tsx`, `Scoreboard`.)
- **Disabled buttons don't read as disabled.** `Button` uses `disabled:opacity-40` of the
  accent. On a dark accent that produces a colour which looks like an ordinary dull button
  rather than an off one — which is why "Add it" looked broken. It is in fact enabled and
  bright the moment both fields are filled; the disabled state is the thing that needs its
  own treatment. (`Field.tsx`.)
- **Onboarding's last step has no Skip.** Birthday is optional and every other optional step
  shows one; the last shows only Done. (`Onboarding.tsx`.)

---

# Findings from the screenshot pass I'd overrule

- **"Grey secondary text is probably below 4.5:1 in a few places."** Mostly not. `ash`
  measures **6.22:1** on the page and **5.05–5.52:1** on cards, and `chalk` is 18:1. The real
  failures are elsewhere and are named above: placeholders at 2.67:1, the 18+ line at
  3.43:1, and everything white-on-accent at 1.6–2.8:1.
- **"Avatar order flips between screens."** Could not reproduce. Both sessions put self on
  the left in the Home header, and both put the partner's answer above yours in the daily
  card. If there's a screenshot of the Play card doing otherwise, it's worth seeing before
  anyone changes it.
- **"The Together carousel has a stray sliver and unequal card heights."** Could not
  reproduce at 360×740. `Tile` has a fixed `h-44` and the rail measured evenly. The sliver
  is most likely the wide anniversary card's snap peek with the rail mid-scroll.
- **"Nothing on Home indicates whose move it is."** There is a signal — the daily card's
  ground tint swaps from your colour to theirs when it's your move, and their avatar appears
  in the card's header. It's an 18% tint and a 24px circle. Too quiet, rather than missing;
  the fix is to amplify what's there.
- **"The 'When' field renders as an empty black box."** At 360×740 in Chrome it renders
  "mm/dd/yyyy" in grey. It's a bare native `<input type="date">` with no styling of its own,
  so it will look different on every browser and Android WebView — that unstyled-ness is
  the thing to fix, not one specific rendering.
- **"The tab bar overlaps content and cuts headings in half."** Partly. At rest, every
  screen has enough bottom padding — measured at full scroll, nothing is covered. What is
  covered is content *mid-scroll*, because the bar is 82% opaque over a blurred backdrop,
  so a headline passing behind it is legible enough to notice and not enough to read. That
  makes it a treatment question (more blur, more transparency, a fade at the bar's edge)
  rather than a padding bug.

---

# Taste decisions — for Krishn, not for Claude Code

**a. What is the third accent?** Three options, in increasing order of work and of how
well they fit the app: a fixed warm bone/chalk, which keeps the interface monochrome and
leaves the two people as the only colour on screen; a fixed neutral belonging to neither
of you; or the *blend* of the two accents — the couple's own colour — which is the most
on-brief answer and the most work, since it changes per pair.

**b. Once both have answered, should Home still lead with the question?** Item 6 assumes
not. The alternative is that the question stays the anchor of the day and Today never
gets the first screen.

**c. Play's headline stat: agreement or disagreement?** "23 of 34 the same" versus
"11 you see differently". The copy underneath already argues for the second.

**d. Do the two prose cards belong on Home at all?** They're promises worth making, but
they're made once and read once.

**e. The 18+ line: Play or Us?** The code comment argues, well, for Play. The counter-
argument is that it's the only permanent settings text on a content screen.

**f. Should the invite code get a real moment?** It's currently a mono string in a box. It
is also the only screen a person sees before they have a partner, and the only one they'll
screenshot and send.

**g. Cold open.** The guardrail says nothing animates on page load. Does the monogram get
an exception, or does the app open in silence on purpose?

**h. The add-forms sit permanently above their lists** on Coming up and Memories. Once
there's content, should they fold behind an add button?
