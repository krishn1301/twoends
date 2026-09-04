/**
 * The line above the record button.
 *
 * A microphone with nothing said about it is a feature; a microphone with a
 * reason next to it is an invitation. These rotate the way the held quotes on
 * the anniversary counter do — a different one each time you open it, never the
 * same twice running — because a fixed line stops being read after a week and
 * then the button is just a microphone again.
 *
 * Written in the app's voice, which means restrained: they say why somebody
 * would want to hear you, and none of them tells you to do it. No exclamation
 * marks, no "go on", nothing that nags. The couple supplies the affection; the
 * app supplies the reason to bother.
 */
export const VOICE_LINES = [
  'They know what you look like. This is the other half.',
  'Thirty seconds of you is worth more than a paragraph.',
  'Say the thing you would say if they were in the room.',
  'A voice carries what typing takes out.',
  'They would rather hear this than read it.',
  'Tell them what today sounded like.',
  'The bit you would have said out loud.',
  'Nothing to compose. Just say it.',
  'They will play this more than once.',
  'Half a minute, and they hear you rather than read you.',
  'Say it badly. It is better badly.',
  'The one thing a photograph cannot do.',
  'What you would have called about.',
  'They miss the sound, not just the face.',
  'Speak like nobody is transcribing it, because nobody is.',
] as const;

/**
 * Why the list is short and the cap is thirty seconds.
 *
 * Both are the same decision. A voice note with no ceiling becomes a thing you
 * put off until you have something worth saying; a rotating line that promises
 * something momentous does the same. Keeping them small keeps them sendable.
 */
export const VOICE_CAP_SECONDS = 30;
