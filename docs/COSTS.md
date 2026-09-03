# Running costs

Target: **₹0/month up to the first ~1,000 pairs.** There is no revenue, so every
feature gets costed before it gets built. Re-check this file at the end of every
phase.

## The arithmetic that decides everything

Supabase's free tier gives roughly **1 GB storage** and **5 GB egress/month**.

|                                           |             |
| ----------------------------------------- | ----------- |
| Photo after client-side resize + WebP q75 | ~300 KB     |
| Photos per pair per day                   | 1           |
| Storage per pair per year                 | **~110 MB** |
| Pairs that fill the free tier             | **~9**      |

Nine pairs. That is the whole budget, and photos are the only thing that
threatens it — text, strokes and counters are rounding errors by comparison.
A canvas drawing is stored as a stroke array, not a bitmap, which is why it
costs almost nothing and can also be replayed and undone.

## Levers, in the order they get pulled

1. **Client-side resize + WebP before upload.** A 3 MB phone photo becomes
   ~200 KB. Never upload an original — this is a project rule, not a preference.
2. **60-day TTL with keep-on-demand.** Photos are due to go after 60 days unless
   either partner taps "keep". Swept by a scheduled Edge Function.
3. **Widget images cached on-device.** A widget that re-fetches on every refresh
   burns egress, which is the metric that bites first.
4. **Move the bucket to Cloudflare R2** when storage becomes binding — 10 GB
   free and, more importantly, no egress charges.
5. **Document self-hosting** so heavy users can carry their own cost.

## Fixed costs, verified 10 Aug 2026

| Path                                              | Cost                                  |
| ------------------------------------------------- | ------------------------------------- |
| Android APK, sideloaded                           | Free                                  |
| Google Play listing                               | $25, one time                         |
| PWA on iPhone                                     | Free                                  |
| iOS native, own devices only (free Personal Team) | Free, but 7-day build expiry          |
| App Store publishing                              | **$99/year** — there is no free route |

Current distribution plan needs none of these: sideloaded APK plus a PWA on
Cloudflare Pages, both free.

## Status

Phase 0. Nothing is deployed, nothing is stored, cost is ₹0.
