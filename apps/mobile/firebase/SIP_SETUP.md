# Monthly giving (SIP) with Razorpay: setup

Test mode first. Nothing real is charged until you switch Razorpay to live keys.

1. **Razorpay account.** Sign up at razorpay.com. In the dashboard keep the **Test Mode** switch on. Go to Account & Settings > API keys > Generate Test Key. You get a Key Id (starts `rzp_test_`) and a Key Secret.
2. **Firebase Blaze plan.** Firebase console > Upgrade. Cloud Functions will not deploy without it.
3. **Log in once on this PC:** `firebase login` (or `npx firebase-tools login`).
4. **Store the secrets** (run in `apps/mobile/firebase`; each command asks you to type or paste the value, so it never goes in chat or in the code):
   - `firebase functions:secrets:set RAZORPAY_KEY_ID`
   - `firebase functions:secrets:set RAZORPAY_KEY_SECRET`
   - `firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET` (type any long random text and remember it for step 6)
5. **Deploy:** `firebase deploy --only functions,firestore:rules`
6. **Razorpay webhook.** Dashboard > Account & Settings > Webhooks > Add. URL: `https://asia-south1-goodneighbour-7a870.cloudfunctions.net/razorpayWebhook`. Secret: the same text as `RAZORPAY_WEBHOOK_SECRET`. Tick all **Subscription** events. Save.
7. **In the app (as admin):** profile > Admin > Monthly giving (SIP): enter the receiver's name and number or UPI ID, switch it ON, Save.
8. **Try it:** open an approved fundraiser > Donate > **Every month**. In Razorpay's test page use the UPI ID `success@razorpay` (use `failure@razorpay` to see a failed approval).

Notes
- Amounts: Rs 100 to Rs 15,000 a month (above that a UPI AutoPay debit needs extra approval every time).
- Razorpay pays out to the bank account in its dashboard. The receiver set in the app is what donors see and what the admin team uses when passing money on (Admin > payout records).
- Going live needs a registered business or trust, KYC, and Razorpay's live approval for Subscriptions. Take advice from a CA or lawyer first: collecting money for other people has rules.
