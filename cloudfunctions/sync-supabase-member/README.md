# Supabase → CloudBase member sync

CloudBase Node.js 18 HTTP Function. It accepts Supabase Database Webhook `INSERT` and `UPDATE` events for `public.members`, validates `X-Sync-Secret`, maps the member fields, and writes to CloudBase PostgreSQL `public.members` using `card_no` as the business key.

For a newly inserted member, it initializes the guest-card pools from the membership level. When an existing member's level changes, it replaces the pool totals and eligible projects with the new level template; ordinary profile edits preserve consumed/remaining counts.

Required runtime environment variables:

- `TCB_ENV=charmsway-d8g4rudqda2f7525c`
- `CLOUDBASE_APIKEY` — dedicated server API key read by the CloudBase SDK
- `SYNC_SHARED_SECRET` (or CloudBase Console-compatible `SYNCSECRET`) — random shared secret also stored in Supabase Vault

Deploy as an HTTP Function on runtime `Nodejs20.19`. The public gateway/function rule may allow anonymous transport because the endpoint performs its own constant-time shared-secret check.
