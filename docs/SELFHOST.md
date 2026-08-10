# Self-hosting

Stub until Phase 10.

The goal: anyone can point TwoEnds at their own Supabase project and run the
whole thing themselves. It costs us nothing to support and it is the strongest
possible answer to "how is this free?" — you do not have to trust us, you can
carry your own cost.

Will cover:

- Creating a Supabase project and applying `supabase/migrations/`.
- The two environment variables in `.env.example`.
- Deploying the Edge Functions (push, media sweep, capsule delivery).
- Building your own APK.
- Moving media to Cloudflare R2 if storage becomes the binding constraint.
