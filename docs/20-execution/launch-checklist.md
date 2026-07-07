# Launch Checklist (LCH-001)

## Status snapshot (2026-07-07)
Platform is live on prod (app/api.secretofsaleschat.org, HTTPS) with WhatsApp
two-way + bot, CEO channel, Canva, Google, backups + health monitor.

## Legal
- [x] Privacy Policy page — https://app.secretofsaleschat.org/privacy (DRAFT — needs lawyer review)
- [x] Terms of Service page — https://app.secretofsaleschat.org/terms (DRAFT — needs lawyer review)
- [ ] Lawyer sign-off on both
- [ ] Data-processing note for WhatsApp/AI usage

## Meta App Review (needed to message beyond the 5 test numbers)
- [ ] Move app from Development → Live mode
- [ ] Business verification of Sos academy
- [ ] Request `whatsapp_business_messaging` for production
- [ ] Screencast: inbound message → bot reply → gated send → approval
- [ ] Privacy policy URL (above) entered in the app dashboard

## Security hardening (before real customers)
- [ ] Rotate keys exposed in chat: AWS access key, GitHub PAT, Meta token
- [ ] AWS root MFA (required by ~Aug 8)
- [ ] Change SEED_ADMIN_PASSWORD to a chosen strong password
- [ ] Restrict SSH security-group rule to the CEO's IP (currently 0.0.0.0/0)

## Reliability
- [x] Nightly DB backup (14-day retention) + restore procedure documented
- [x] 5-min health monitor with auto-restart
- [ ] Off-host backup copies to S3 (at GA)

## Product UAT
- [x] Login + dashboard live
- [x] Approvals inbox approve/reject → executes
- [x] WhatsApp inbound captured, bot auto-replies (Hebrew), sensitive → approval
- [x] CEO content command → draft + Canva design link
- [x] CEO teach command → permanent memory; file upload training
- [x] Image message → Claude vision reply
- [ ] Dedicated business phone number connected
- [ ] Partner Instagram connected + scheduled posting

## Blocked on external actions (CEO)
- Dedicated WhatsApp business number (purchase)
- Partner Instagram: Professional account + linked Facebook Page + BM access
