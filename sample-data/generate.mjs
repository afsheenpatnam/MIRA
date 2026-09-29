// Generates synthetic incident-history CSVs for importing into MIRA:
// 10 monthly exports (Dec 2025 – Sep 2026) for each sector. Run: node sample-data/generate.mjs
// Problems recur across months with the same failed fixes, so MIRA can learn real patterns.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Small deterministic PRNG so the files are the same every time.
let seed = 20260929;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (typeof vars[k] === 'function' ? vars[k]() : vars[k] ?? `{${k}}`));

const SECTORS = {
  fintech: {
    engineers: ['Priya Raman', 'Arjun Mehta', 'Sneha Iyer', 'Farhan Ali', 'Kavin Das'],
    vars: {
      p99: () => pick(['6.4', '7.9', '8.2', '9.1', '11.3']),
      peak: () => pick(['the salary-day peak', 'the Diwali sale', 'month-end settlements', 'a cashback campaign', 'the IPL final evening']),
      bank: () => pick(['HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak']),
      n: () => pick(['140', '212', '380', '96', '505']),
      rate: () => pick(['41', '55', '62', '38']),
      card: () => pick(['4539 8812 0093 2211', '5241 7730 1182 9054', '4111 2233 4455 6677']),
      phone: () => pick(['9876501234', '9123456780', '9988776655']),
      upi: () => pick(['rahul.k@okhdfc', 'meena.s@ybl', 'arun.p@okicici']),
      email: () => pick(['neha.r@gmail.com', 'vikram.t@outlook.com']),
    },
    archetypes: [
      { w: 5, service: 'payments-api', category: 'Connection pool exhaustion', title: 'UPI collect requests timing out',
        alert: ['HikariPool-1 connection is not available, request timed out after 30000ms. p99 latency {p99}s', 'payments-api p99 {p99}s during {peak}, Hikari waiting threads above 150'],
        rootCause: ['maxPoolSize was 20 and idle-in-transaction sessions held connections open during {peak}', 'A long finance report query held connections on the primary during {peak}, exhausting the pool'],
        failed: ['Restarting payments-api pods (timeouts returned within minutes)', 'Scaling payments-db to a bigger instance'],
        fix: ['Killed idle-in-transaction sessions and raised maxPoolSize from 20 to 60', 'Moved the finance report to the read replica and killed the long-running sessions'], minutes: [12, 28] },
      { w: 3, service: 'upi-switch', category: 'Payment switch latency', title: 'UPI callbacks delayed from partner bank',
        alert: ['upi-switch callback latency p99 {p99}s for {bank}, pending transactions growing'],
        rootCause: ['{bank} was degraded on the payment switch and our retries doubled the load on it'],
        failed: ['Increasing our callback retry count'],
        fix: ['Enabled the bank-level circuit breaker for {bank} and showed a "bank is slow" banner in the app'], minutes: [20, 45] },
      { w: 3, service: 'otp-service', category: 'SMS gateway throttling', title: 'OTP delivery dropped',
        alert: ['otp-service delivery_rate={rate}%, sms-gateway-a responding 429 Too Many Requests'],
        rootCause: ['A marketing push during {peak} used the same SMS route as OTPs and gateway A throttled us'],
        failed: ['Bulk-retrying failed OTPs (made the throttling worse)'],
        fix: ['Failed over OTP traffic to sms-gateway-b and resumed the campaign in batches'], minutes: [8, 18] },
      { w: 2, service: 'reversal-worker', category: 'Bad deploy', title: 'Money debited but payment shown failed',
        alert: ['{n} complaints: amount debited, status FAILED, no auto-reversal after 30 minutes. Example VPA {upi}'],
        rootCause: ['A deploy renamed the reversal queue so reversal-worker consumed from an empty queue'],
        failed: ['Asking customers to wait 48 hours'],
        fix: ['Pointed reversal-worker at the correct queue and re-ran the missed reversal batch for the last 6 hours'], minutes: [18, 35] },
      { w: 1, service: 'gateway-edge', category: 'Certificate expiry', title: 'Card payments failing with TLS errors',
        alert: ['gateway-edge SSLHandshakeException to card network endpoint'],
        rootCause: ['The client certificate for the card network expired and the renewal reminder went to an old email alias'],
        failed: ['Restarting gateway-edge'],
        fix: ['Installed the renewed client certificate and moved renewal reminders to the on-call calendar'], minutes: [22, 40] },
      { w: 2, service: 'settlement-uploader', category: 'Partner bank integration', title: 'Settlement file upload failed',
        alert: ['SFTP authentication failed uploading the settlement file to {bank}; merchant payouts delayed'],
        rootCause: ['{bank} rotated its SFTP host key and our client rejected the new fingerprint'],
        failed: ['Retrying the upload repeatedly (locked the SFTP account)'],
        fix: ['Bank ops unlocked the account, we added the new host fingerprint and re-uploaded the file'], minutes: [35, 60] },
      { w: 2, service: 'kyc-service', category: 'Vendor rate limits', title: 'eKYC verification timing out',
        alert: ['kyc-service vendor timeouts at 35%; customer {email} stuck at onboarding'],
        rootCause: ['The eKYC vendor lowered our rate limit and requests above it hung until timeout'],
        failed: ['Increasing the vendor timeout to 60 seconds'],
        fix: ['Added a token-bucket queue at the new vendor limit and retried queued verifications'], minutes: [25, 50] },
      { w: 2, service: 'payments-api', category: 'Idempotency', title: 'Customers charged twice',
        alert: ['Duplicate debits reported; card {card}, customer phone {phone}'],
        rootCause: ['Checkout retried after a gateway timeout without an idempotency key, so the charge ran twice'],
        failed: ['Issuing manual refunds one by one'],
        fix: ['Added an idempotency key on transaction id and auto-reversed the duplicate charges'], minutes: [30, 55] },
      { w: 2, service: 'ledger-db', category: 'Database locks', title: 'Wallet top-ups failing',
        alert: ['Lock wait timeout exceeded on ledger_entries; wallet top-ups failing'],
        rootCause: ['The month-end reconciliation job ran on the primary database and locked ledger_entries'],
        failed: ['Scaling the database instance up'],
        fix: ['Killed the reconciliation job and moved it to the read replica'], minutes: [6, 15] },
      { w: 2, service: 'auth-service', category: 'Session store evictions', title: 'Users logged out repeatedly',
        alert: ['auth-service session not found errors; Redis evicted_keys climbing'],
        rootCause: ['Redis hit maxmemory and allkeys-lru evicted live sessions'],
        failed: ['Restarting auth-service'],
        fix: ['Raised Redis maxmemory, switched to volatile-lru and moved sessions to a dedicated Redis'], minutes: [14, 30] },
      { w: 1, service: 'pricing-service', category: 'Bad deploy', title: 'Convenience fee charged twice',
        alert: ['Convenience fee doubled on bill payments after release {n}'],
        rootCause: ['A config typo in the release applied the fee rule twice'],
        failed: ['Hotfixing forward without tests (introduced a second bug)'],
        fix: ['Rolled back the release and refunded the fee difference'], minutes: [20, 40] },
      { w: 1, service: 'merchant-webhooks', category: 'Webhook secrets', title: 'Merchant webhooks rejected',
        alert: ['merchant-webhooks signature verification failed for most merchants'],
        rootCause: ['A signing secret rotation was not propagated to the webhook sender'],
        failed: ['Resending all failed webhooks at once (merchants rate-limited us)'],
        fix: ['Updated the secret and replayed failed webhooks at 20 per second'], minutes: [25, 45] },
    ],
  },
  ecommerce: {
    engineers: ['Rahul Verma', 'Meera Joshi', 'Farah Khan', 'Nikhil Rao', 'Divya Menon'],
    vars: {
      sale: () => pick(['the Big Sale', 'the Mega Sale', 'a flash sale', 'the weekend sale', 'the festive sale']),
      pct: () => pick(['7', '12', '18', '24']),
      n: () => pick(['412', '1,280', '96', '2,300', '640']),
      courier: () => pick(['FastShip', 'QuickDrop', 'ExpressGo']),
      email: () => pick(['anita.s@gmail.com', 'rohit.m@yahoo.com', 'kavya.n@outlook.com']),
      phone: () => pick(['9876012345', '9811122233']),
    },
    archetypes: [
      { w: 5, service: 'cart-service', category: 'Redis memory pressure', title: 'Checkout returning 503',
        alert: ['cart-service 503 Service Unavailable during {sale}; redis-cart used_memory 99%', 'Carts emptied for logged-in users; redis-cart evictions 40k per minute'],
        rootCause: ['Redis cart memory filled up and evicted live cart sessions while the autoscaler added pods that opened more connections'],
        failed: ['Letting the autoscaler add cart-service pods', 'Clearing the CDN cache'],
        fix: ['Froze cart-service autoscaling, raised redis-cart maxmemory, switched eviction to volatile-lru and warmed the top 500 products'], minutes: [15, 30] },
      { w: 3, service: 'search-api', category: 'Search index', title: 'Search returning no products',
        alert: ['search-api zero-result rate 71%; products alias document count far below normal'],
        rootCause: ['The nightly reindex failed halfway but still switched the products alias to the new index'],
        failed: ['Rebuilding the whole index from scratch (took 2 hours)'],
        fix: ['Pointed the products alias back to the previous index and re-ran the reindex with the alias switch disabled'], minutes: [5, 12] },
      { w: 2, service: 'payment-bridge', category: 'Payment gateway errors', title: 'Card payments failing at checkout',
        alert: ['payment-bridge gateway returned 502 for {pct}% of card payments'],
        rootCause: ['The primary card gateway had a partial outage and the failover flag had been left off after a test'],
        failed: ['Restarting payment-bridge'],
        fix: ['Turned on automatic failover to the secondary gateway and added an alert when the flag is off'], minutes: [10, 20] },
      { w: 2, service: 'storefront', category: 'Traffic spike', title: 'Product pages slow at sale launch',
        alert: ['Origin requests up 9x at 12:00 for {sale}; product page load time 7s'],
        rootCause: ['A full CDN purge right before {sale} sent all traffic to origin'],
        failed: ['Adding more origin servers during the spike'],
        fix: ['Stopped full purges before sales; purge changed URLs only and pre-warm the top pages'], minutes: [20, 35] },
      { w: 2, service: 'coupon-service', category: 'Idempotency', title: 'Coupons applied twice',
        alert: ['{n} orders received the discount twice during {sale}; first reported by {email}'],
        rootCause: ['Checkout retried coupon redemption after timeouts and coupon-service had no idempotency key'],
        failed: ['Clearing the coupon cache'],
        fix: ['Added an idempotency key on order id, disabled the extra retry and reversed duplicate discounts'], minutes: [30, 45] },
      { w: 2, service: 'inventory-service', category: 'Overselling', title: 'Items oversold during sale',
        alert: ['{n} orders placed for items that were already out of stock during {sale}'],
        rootCause: ['Two services decremented stock without a lock, so concurrent orders sold the same unit'],
        failed: ['Cancelling oversold orders manually'],
        fix: ['Switched to an atomic stock decrement with a 10-minute reservation'], minutes: [35, 70] },
      { w: 2, service: 'notification-service', category: 'Bad deploy', title: 'Order confirmation emails not sent',
        alert: ['notification queue depth 52,000 and rising; customer {email} got no confirmation'],
        rootCause: ['A deploy changed the email template id and the notifier kept failing and requeuing'],
        failed: ['Restarting the notifier'],
        fix: ['Rolled back the template change and drained the queue with a rate limit'], minutes: [20, 30] },
      { w: 1, service: 'image-resizer', category: 'Performance', title: 'Product images loading slowly',
        alert: ['image-resizer p95 4.2s; CPU at 100%'],
        rootCause: ['Resized image variants were not cached, so every request resized the original again'],
        failed: ['Moving image-resizer to bigger instances'],
        fix: ['Enabled CDN caching for resized variants with a 30-day TTL'], minutes: [25, 40] },
      { w: 2, service: 'logistics-bridge', category: 'Courier integration', title: 'Shipping labels not generating',
        alert: ['logistics-bridge {courier} API returning 500 for label creation; {n} orders waiting'],
        rootCause: ['{courier} had an outage and our client retried in a tight loop'],
        failed: ['Retrying label creation in a loop'],
        fix: ['Switched new shipments to the secondary courier and queued the rest with backoff'], minutes: [30, 60] },
      { w: 1, service: 'pricing-sync', category: 'Data sync', title: 'Wrong prices shown after sync',
        alert: ['{n} products showing previous day prices after the 06:00 price sync'],
        rootCause: ['The price feed parser read times as UTC, so the new file was treated as old'],
        failed: ['Re-running the sync without a fix'],
        fix: ['Restored the correct price file and fixed the timezone in the parser'], minutes: [25, 45] },
      { w: 2, service: 'checkout-api', category: 'Connection pool exhaustion', title: 'Checkout timeouts at peak',
        alert: ['checkout-api database pool exhausted; p99 6s during {sale}'],
        rootCause: ['The connection pool was sized for normal traffic, not {sale}'],
        failed: ['Restarting checkout-api pods'],
        fix: ['Raised the pool size and added a read replica for order history queries'], minutes: [12, 25] },
      { w: 1, service: 'reco-service', category: 'Dependency timeouts', title: 'Product pages hanging',
        alert: ['Product pages waiting 8s on reco-service; support line {phone} flooded'],
        rootCause: ['Product pages called reco-service synchronously with no timeout'],
        failed: ['Raising the reco-service timeout'],
        fix: ['Added a 300ms timeout with a circuit breaker and a static fallback list'], minutes: [15, 30] },
    ],
  },
  edtech: {
    engineers: ['Karthik Menon', 'Ananya Rao', 'Ishaan Gupta', 'Neha Kulkarni', 'Varun Pillai'],
    vars: {
      exam: () => pick(['semester finals', 'the Sunday mock test', 'the entrance mock', 'mid-term exams']),
      n: () => pick(['50,000', '3,412', '2,300', '12,000', '870']),
      email: () => pick(['ananya.k@gmail.com', 'rohan.s@outlook.com', 'learner.priya@yahoo.com']),
      phone: () => pick(['9123456780', '9900112233']),
    },
    archetypes: [
      { w: 5, service: 'exam-service', category: 'Session store evictions', title: 'Exam answers not saving',
        alert: ['exam-service autosave 409 session not found during {exam}; redis-exam used_memory 99%', 'Autosave failing for learner {email} during {exam}'],
        rootCause: ['The Redis session store ran out of memory and evicted live exam sessions', '{exam} used the shared Redis instead of the dedicated exam Redis'],
        failed: ['Restarting exam-service (learners lost unsaved answers)'],
        fix: ['Extended the exam window, raised redis-exam maxmemory, moved sessions to the dedicated Redis and replayed the autosave journal'], minutes: [15, 35] },
      { w: 3, service: 'media-edge', category: 'Video streaming', title: 'Live classes buffering',
        alert: ['media-edge rebuffer ratio 18% for {n} learners; origin egress at 100%'],
        rootCause: ['A CDN config change disabled the origin shield so every viewer pulled video from origin'],
        failed: ['Lowering video bitrate for everyone'],
        fix: ['Re-enabled the origin shield and moved the south region to the secondary CDN until load settled'], minutes: [15, 25] },
      { w: 2, service: 'results-api', category: 'Traffic spike', title: 'Results portal down on results day',
        alert: ['results-api 502; database read replica lag 90s at 40x normal traffic'],
        rootCause: ['Every results page hit the database and replicas fell behind'],
        failed: ['Adding more results-api pods (increased database load)'],
        fix: ['Served results from pre-generated static pages on the CDN behind a waiting room'], minutes: [20, 35] },
      { w: 2, service: 'fee-payments', category: 'Payment webhooks', title: 'Fee payments stuck as pending',
        alert: ['fee-payments webhook signature verification failed; {n} payments pending'],
        rootCause: ['The payment gateway webhook secret was rotated but not updated in fee-payments'],
        failed: ['Asking learners to pay again (caused double charges)'],
        fix: ['Updated the webhook secret, reconciled pending payments and refunded duplicates'], minutes: [35, 50] },
      { w: 2, service: 'auth-service', category: 'SMS provider', title: 'Login OTPs delayed',
        alert: ['auth-service OTP delivery p95 4 minutes at exam start; learner phone {phone}'],
        rootCause: ['A marketing notification blast used the same SMS route as login OTPs'],
        failed: ['Bulk resending OTPs'],
        fix: ['Moved OTPs to a dedicated transactional SMS route with email OTP as fallback'], minutes: [10, 20] },
      { w: 1, service: 'certificate-worker', category: 'Bad deploy', title: 'Certificates not generating',
        alert: ['{n} course certificates stuck; worker log: font not found NotoSans'],
        rootCause: ['A base image upgrade removed the font package the PDF renderer needs'],
        failed: ['Restarting certificate-worker'],
        fix: ['Added the font package back, redeployed and re-queued the failed certificates'], minutes: [25, 40] },
      { w: 2, service: 'transcoder', category: 'Queue backlog', title: 'Uploaded lectures not processing',
        alert: ['transcoder queue backlog {n} videos; consumer lag 3 hours'],
        rootCause: ['One corrupt upload kept failing and blocked the queue because it retried forever'],
        failed: ['Adding more transcoder workers'],
        fix: ['Moved the corrupt file to a dead-letter queue and set a max retry count of 5'], minutes: [20, 40] },
      { w: 1, service: 'proctor-service', category: 'Browser compatibility', title: 'Webcam check failing before exams',
        alert: ['proctor-service webcam permission check failing for Chrome users before {exam}'],
        rootCause: ['A Chrome update changed the camera permission API used by our proctoring SDK'],
        failed: ['Asking learners to reinstall Chrome'],
        fix: ['Upgraded the proctoring SDK and added a manual camera test fallback'], minutes: [30, 60] },
      { w: 2, service: 'assignments-api', category: 'Gateway config', title: 'Assignment uploads rejected',
        alert: ['assignments-api 413 Payload Too Large for PDF submissions; learner {email}'],
        rootCause: ['An API gateway change lowered the upload limit from 50 MB to 1 MB'],
        failed: ['Restarting assignments-api'],
        fix: ['Restored the 50 MB upload limit in the gateway and extended the deadline'], minutes: [10, 20] },
      { w: 1, service: 'scheduler', category: 'Data sync', title: 'Class timetable shifted by hours',
        alert: ['Timetable shows classes 5.5 hours late for {n} learners'],
        rootCause: ['The timetable sync wrote UTC times into a field the app reads as IST'],
        failed: ['Editing class times by hand'],
        fix: ['Re-ran the sync with IST conversion and added a timezone test'], minutes: [20, 35] },
      { w: 2, service: 'grades-db', category: 'Database locks', title: 'Gradebook not saving marks',
        alert: ['grades-db lock wait timeout; teachers unable to save marks after {exam}'],
        rootCause: ['A heavy analytics report ran on the primary grades database'],
        failed: ['Scaling the database instance up'],
        fix: ['Killed the report and moved analytics to the read replica'], minutes: [6, 15] },
      { w: 1, service: 'mailer', category: 'Email delivery', title: 'Emails going to spam',
        alert: ['mailer bounce and spam rate 40% after DNS change'],
        rootCause: ['A DNS migration dropped the DKIM record for the sending domain'],
        failed: ['Resending all emails'],
        fix: ['Restored the DKIM and SPF records and resent only to unopened recipients'], minutes: [30, 60] },
    ],
  },
};

const MONTHS = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const HEADER = ['id', 'title', 'service', 'category', 'alert', 'root cause', 'failed fixes', 'fix', 'resolved by', 'minutes', 'date'];
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

for (const [sector, def] of Object.entries(SECTORS)) {
  const dir = join(here, sector);
  mkdirSync(dir, { recursive: true });
  const bag = def.archetypes.flatMap((a) => Array(a.w).fill(a));
  let code = sector === 'fintech' ? 1001 : sector === 'ecommerce' ? 2001 : 3001;
  let total = 0;

  MONTHS.forEach((month, m) => {
    const count = int(7, 9);
    const rows = [];
    for (let i = 0; i < count; i += 1) {
      const a = pick(bag);
      // Resolve each variable once per row so the alert, cause and fix describe the same event.
      const v = Object.fromEntries(Object.entries(def.vars).map(([k, f]) => [k, f()]));
      const day = String(int(1, 28)).padStart(2, '0');
      const failedCount = rnd() < 0.2 ? 0 : a.failed.length > 1 && rnd() < 0.35 ? 2 : 1;
      const failed = [...a.failed].sort(() => rnd() - 0.5).slice(0, failedCount);
      rows.push({
        date: `${month}-${day}`,
        cells: [
          a.title,
          a.service,
          a.category,
          fill(pick(a.alert), v),
          fill(pick(a.rootCause), v),
          failed.join('; '),
          fill(pick(a.fix), v),
          pick(def.engineers),
          int(a.minutes[0], a.minutes[1]),
        ],
      });
    }
    rows.sort((x, y) => x.date.localeCompare(y.date));
    const lines = [HEADER.map(csvCell).join(','), ...rows.map((r) => [`INC-${code++}`, ...r.cells, r.date].map(csvCell).join(','))];
    const file = join(dir, `${String(m + 1).padStart(2, '0')}-incidents-${month}.csv`);
    writeFileSync(file, `${lines.join('\n')}\n`);
    total += rows.length;
  });
  console.log(`${sector}: 10 files, ${total} incidents`);
}
