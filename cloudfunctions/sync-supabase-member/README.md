# Supabase → CloudBase member sync

CloudBase Node.js HTTP Function. It accepts Supabase Database Webhook `INSERT` and `UPDATE` events for `public.members`, validates `X-Sync-Secret`, and writes the complete phone number, joining time, membership-change time and other member fields to CloudBase PostgreSQL `public.members`. Existing records are resolved by card number or phone number so a card-number change does not create a duplicate member or lose the phone update.

For a newly inserted member, it initializes the guest-card pools from the membership level. When an existing member's level changes, it replaces the pool totals and eligible projects with the new level template; ordinary profile edits preserve consumed/remaining counts.

Required runtime environment variables:

- `TCB_ENV=charmsway-d8g4rudqda2f7525c`
- `CLOUDBASE_APIKEY` — dedicated server API key read by the CloudBase SDK
- `SYNC_SHARED_SECRET` (or CloudBase Console-compatible `SYNCSECRET`) — random shared secret also stored in Supabase Vault

Deploy as an HTTP Function on runtime `Nodejs20.19`. The public gateway/function rule may allow anonymous transport because the endpoint performs its own constant-time shared-secret check.

Update the existing production function from the member-management repository root with:

```sh
tcb -e charmsway-d8g4rudqda2f7525c fn code update sync-supabase-member \
  --dir "cloudfunctions/sync-supabase-member" \
  --deployMode zip
```

The `--dir` value must point directly at the function directory containing `scf_bootstrap`; passing its parent directory leaves the HTTP Function without an entrypoint.
