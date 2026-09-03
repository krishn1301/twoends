import { useEffect, useState } from 'react';

/**
 * What this device thinks the screen is.
 *
 * Here because a bug took three attempts to place and every one of them was a
 * guess. The tab bar was reported sitting in a different spot on every screen
 * of an iPhone PWA and nowhere on Android, and the only evidence available was
 * screenshots — from which the pill measured 884 device pixels wide three times
 * and 840 the fourth, which is the whole page at 95%. That is iOS
 * shrink-to-fit: something on the page is wider than the screen, so iOS scales
 * the document down to make it fit, and every `position: fixed` element is then
 * laid out against a viewport that is not the one you are looking at.
 *
 * `scale` below is the number that says so, and `overflow` is the number that
 * says what caused it. One screenshot of this settles what a week of reasoning
 * from pictures could not.
 *
 * It lives in Us rather than on the colophon: the colophon is a page of
 * promises and a table of pixel measurements is not one of them.
 */
export function Viewport() {
  const [, tick] = useState(0);

  useEffect(() => {
    const bump = () => tick((n) => n + 1);
    const vv = window.visualViewport;

    // Once on mount: the probe below does not exist during the first render, so
    // the safe-area inset reads `n/a` until something asks again.
    bump();

    window.addEventListener('resize', bump);
    vv?.addEventListener('resize', bump);
    vv?.addEventListener('scroll', bump);

    return () => {
      window.removeEventListener('resize', bump);
      vv?.removeEventListener('resize', bump);
      vv?.removeEventListener('scroll', bump);
    };
  }, []);

  const doc = document.documentElement;
  const vv = window.visualViewport;

  /*
    The safe-area insets are only readable through a real element: `env()` is
    not exposed to script and a custom property holding it resolves to the
    literal string until something lays it out.
  */
  const probe = document.getElementById('safe-area-probe');
  const inset = probe ? Math.round(Number.parseFloat(getComputedStyle(probe).paddingBottom)) : null;

  const rows: [string, string][] = [
    ['layout', `${window.innerWidth} x ${window.innerHeight}`],
    ['visual', vv ? `${Math.round(vv.width)} x ${Math.round(vv.height)}` : 'n/a'],
    ['scale', vv ? vv.scale.toFixed(3) : 'n/a'],
    ['overflow', `${doc.scrollWidth - doc.clientWidth}px sideways`],
    ['safe area', inset === null ? 'n/a' : `${inset}px at the bottom`],
    ['dpr', String(window.devicePixelRatio)],
  ];

  return (
    <div className="px-4 py-3.5">
      <dl className="counter grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.72rem]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ash">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-ash mt-3 text-[0.72rem] leading-relaxed">
        A scale that is not 1.000, or an overflow above 0, means the page is wider than the screen
        and everything pinned to an edge will move.
      </p>
      <span
        id="safe-area-probe"
        aria-hidden="true"
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      />
    </div>
  );
}
