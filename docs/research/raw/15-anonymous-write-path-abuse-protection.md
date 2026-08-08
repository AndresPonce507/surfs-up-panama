# 15. Anonymous write path: abuse protection at $0.00/month

**Status:** COMPLETE
**Written:** 2026-08-08
**Scope:** this file only. Nothing under `docs/product/architecture/` or `docs/research/raw/14-*`
is touched.

**Question:** research 08 §10.4 builds the whole free rate-limiting story on the sentence
"the write path is auth-gated". DISCUSS decision 11 refuses to require identity. Nobody has
designed the anonymous case. This file settles it, with prices and quotas cited and dated.

---

## TL;DR

**Verdict: the anonymous write path can be protected at $0.00/month. Research 08 §10.4 was wrong
about why, not about the conclusion.** Auth was never the thing capping cost. The controls that
actually cap cost do not care who is calling.

0. **Check this first or none of it is true.** Reserved concurrency can only be set if the account
   has at least 100 unreserved concurrency units left, and "new AWS accounts have reduced
   concurrency ... quotas" (sources 4b and 4c). **This account is three days old.** Section 5.0 has
   the check and the fallback numbers.
1. **A throttled Lambda Function URL request is not billed.** AWS states it directly: "Invocations
   aren't recorded if the invocation request is throttled ... The value of `Invocations` equals the
   number of requests billed", and "Throttled requests ... don't count as either `Invocations` or
   `Errors`" (source 3, accessed 2026-08-08). **A 429 is free.** That single fact is the entire
   answer to the cost attack.
2. **Reserved concurrency is the rate limiter and there is no other one.** Max RPS through a
   Function URL is exactly 10 x reserved concurrency, everything above returns 429, and setting it
   to 0 deactivates the URL instantly and for free (source 1).
3. **But reserved concurrency bounds the rate of spend, not the total.** At N=2 a month-long
   sustained flood is about **$10.17 in Lambda requests plus about $4.00 in CloudWatch Logs**. Not
   $0. `08` §10.2 calls it "a hard ceiling on Lambda spend rate" without doing that multiplication.
4. **The free circuit breaker closes the gap.** CloudWatch alarm on `Invocations`, to SNS, to a
   Lambda calling `PutFunctionConcurrency(0)`. Fires in about 7 minutes, costs $0.00, blast radius
   is writes only. **Worst case becomes under $1/month.**
5. **Do not put the write path behind CloudFront.** `08` §3.4 recommends it. For writes it is
   backwards: each rejected request bills $1.00 to $2.20 per million at CloudFront versus roughly
   nothing at a bare Function URL, and the attack eats the read path's free 10M requests.
6. **Use DynamoDB provisioned at the free 25 WCU, never on-demand.** Provisioned throttles for
   free. On-demand serves the attack and bills $0.625 per million writes.
7. **Proof of work is not a cost control.** Verifying it runs the resource under attack. It is a
   control for poisoning and junk, it belongs on credential minting rather than report submission,
   and hand-rolled it is under 1 KB while the ALTCHA widget is ~30 KB of a 100 KB page budget.
8. **The "at least 5 distinct reporters" gate in research 09 §13.4 is theatre against a deliberate
   attacker.** The repo is public and the device id is attacker-controlled, so one person with a
   script is five reporters. **And the displayed accuracy scorecard (research 09 §13.3) has no
   stated numeric gate at all**, so on a cold spot it moves with two or three forged reports. That
   is the cheapest attack on the whole product and it hits the differentiator. Section 15.1a.
8b. **`/api/mint` is a second open anonymous write path** and needs the same treatment as
   `/api/report`. Easy to configure the report function and forget this one. Section 14.1a.
9. **Anonymity costs $0 and costs the accuracy scorecard.** The compromise that keeps decision 11
   fully intact: anyone posts instantly and sees their report land, but a report only moves the
   learned correction once its credential is old enough. Invisible to honest users. Section 16.
10. **The largest unpriced exposure is the read path, not the write path.** CloudFront is $1.00 to
    $2.20 per million requests past 10M free and there is no free control for it. Section 15.4.

---

## 1. The contradiction, stated exactly

| Source | Says |
|---|---|
| `08-aws-architecture-and-cost.md` §10.4 | "Get rate limiting for free instead: ... **The write path is auth-gated** and carries a per-user daily quota in DynamoDB." |
| `08` §3.3 | API Gateway usage plans not needed because "public site; **write path is auth-gated**" |
| `08` §8.3 | Recommends magic-link auth (email round trip) before posting |
| `DISCUSS-decisions.md` decision 11 | "**Anonymous now, claim a name later.** Zero friction at the moment that matters" |
| `DISCUSS-decisions.md` decision 4 | "**Three taps, no photo required.**" |
| `DISCUSS-decisions.md` consequences | "**Anonymous reporting** means per-person bias calibration keys on a device id ... **Spam mitigation needed.**" |

Research 08 assumed an identity the product refuses to require. Decision 11 wins, it is binding.
So every control in 08 §10.4 that depends on knowing who is calling is void, and the ones that
survive are the ones that do not care who is calling. That turns out to be most of the useful
ones. Details below.

There is also a second, quieter assumption to kill. 08 §3.4 puts `/api/report` behind the
CloudFront distribution with Origin Access Control. Section 7 below shows that for the write path
specifically that is the **more expensive** choice under attack, by roughly 28x per rejected
request. This is the least obvious finding in the file.

---

## 2. The constraint box

Every option below is judged inside this box. Anything that leaves the box is rejected with the
price stated.

| # | Constraint | Source |
|---|---|---|
| 1 | $0.00/month permanently, no revenue ever | `BRIEF.md` constraint 1 |
| 2 | $20 CloudWatch billing alarm on the account. A costly attack is worse than bad data | `BRIEF.md` constraint 2, `08` §10.2 item 9 |
| 3 | Anonymous, no login, no email, no captcha on the happy path | decisions 4 and 11 |
| 4 | Writes land on Lambda Function URLs, not API Gateway | `08` §3.2, API Gateway free tier is 12 months only |
| 5 | Reports arrive offline queued and batch synced, so a burst from one device is normal | decision 26 |
| 6 | No moderation queue, bad data is handled statistically | decision 24 |
| 7 | Public repo, so any client-side secret is not a secret | `BRIEF.md` constraint 4 |
| 8 | Page budget under 100KB, 3G under 2s, enforced in CI | decision 27 |

Constraint 8 is easy to forget when shopping for defenses. Every client-side widget below is
priced in **kilobytes as well as dollars**, because a 40KB anti-abuse script spends 40% of the
entire page budget.

**Ruled out on price, with the number:**

| Rejected | Actual price | Source, accessed 2026-08-08 |
|---|---|---|
| AWS WAF | **$5.00/month per web ACL + $1.00/month per rule + $0.60 per million requests.** One ACL and two rules is $7.00/month before a single request, 35% of the whole $20 alarm | https://aws.amazon.com/waf/pricing/ (via `08` §10.4, same-day fetch) |
| API Gateway throttling | Free tier is "up to 12 months, new AWS customers only, not a permanent always-free offering" | https://aws.amazon.com/api-gateway/pricing/ (via `08` §1.3) |
| CloudFront flat Pro plan | **$15/month per distribution.** Bundles WAF and bot management with no overage. This is the emergency brake, not the day one control | https://aws.amazon.com/cloudfront/pricing/ (via `08` §2.4) |
| Cognito on every visitor | 10,000 MAU free then $0.0055/MAU (Lite). Free at our scale, but it costs a login, which decision 11 forbids | https://aws.amazon.com/cognito/pricing/ (via `08` §8.1) |

---

## 3. Three threats, kept separate

They have different costs, different fixes, and wildly different priorities.

| # | Threat | What it costs | Priority |
|---|---|---|---|
| 1 | **Cost attack.** Hammer the endpoint to run up the AWS bill | Converts a free project into a real expense. Breaks constraint 1 permanently, not temporarily | **Highest.** This is the only one that can actually end the project |
| 2 | **Data poisoning.** Many false reports to skew a spot's forecast or its accuracy scorecard | Corrupts the differentiator (decision 13, the inline accuracy scorecard). Recoverable, because the raw reports are retained and the correction is recomputable | **Second.** Slow damage, reversible |
| 3 | **Nuisance volume.** Scripted junk that costs little and skews nothing | Storage and log noise. DynamoDB free storage is 25 GB, a junk report is a few hundred bytes, so this is millions of reports before it matters | **Lowest. Explicitly accept it.** Do not spend a single unit of user friction on it |

Ranking rationale, per constraint 2: an attack that inserts bad data is recoverable in an
afternoon by recomputing corrections with the bad reporter down-weighted. An attack that bills
$400 is not recoverable at all, because there is no revenue to pay it from.

---

## 4. What a Lambda Function URL gives you natively

All quotes from AWS docs, accessed **2026-08-08**.

| Control | What you actually get | Verdict |
|---|---|---|
| **Auth type** | "For **Auth type**, choose **AWS_IAM** or **NONE**." `NONE` means "bypass IAM authentication and allow any user to make requests to your function" | Anonymous writes require `NONE`, or `AWS_IAM` with CloudFront OAC signing. See section 7 for why `NONE` is the cheaper of the two under attack |
| **Throttling** | "You can throttle the rate of requests that your Lambda function processes through a function URL by configuring **reserved concurrency**. ... Your function's **maximum request rate per second (RPS) is equivalent to 10 times the configured reserved concurrency**." | **This is the entire native rate limiter.** There is nothing else |
| **Over-limit behavior** | "Whenever your function concurrency exceeds the reserved concurrency, your function URL returns an **HTTP 429** status code. If your function receives a request that exceeds the 10x RPS maximum based on your configured reserved concurrency, you also receive an HTTP 429 error." | Rejection is at the Lambda front door, before your code runs |
| **Kill switch** | "In an emergency, you might want to reject all traffic to your function URL. **To deactivate your function URL, set the reserved concurrency to zero.** This throttles all requests ... resulting in HTTP 429 status responses." | Free, instant, one API call, reversible. This is the circuit breaker in section 6 |
| **CORS** | `AllowOrigins`, `AllowMethods`, `AllowHeaders`, `AllowCredentials`, `MaxAge` configured on the URL itself | Browser-only control. A curl script ignores CORS entirely. **Security theatre against an attacker, useful only against a lazy embed** |
| **Payload cap** | "Invocation payload (request and response): **6 MB each for request and response (synchronous)**" and "**1 MB for the total combined size of request line and header values**" | 6 MB is far too generous for a 3-tap report. Enforce a much smaller cap in the handler and reject early |
| **Timeout** | "Function timeout: **900 seconds (15 minutes)**" default maximum | Never leave this near default on a write path. See section 5 arithmetic |
| **IP allow/deny, geo blocking, per-IP rate limit, bot detection** | **None. Function URLs have no such feature.** Resource-based policies control principals, not client IPs | The gap. Filling it costs money (WAF) or CPU (section 10) |

Sources:
- https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html (accessed 2026-08-08)
- https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html (accessed 2026-08-08)

---

## 5. Reserved concurrency as a cost cap: the arithmetic

### 5.0 PRECONDITION: check the account concurrency quota before believing any of this

Everything below assumes reserved concurrency can actually be set on this account. That is not
guaranteed on a young account and it must be checked in the console before the design is trusted.

> "You can reserve up to the **Unreserved account concurrency value minus 100**. The remaining 100
> units of concurrency are for functions that aren't using reserved concurrency."
> - https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html (accessed 2026-08-08)

The same page confirms the control is free: "Configuring reserved concurrency for a function incurs
no additional charges." (Provisioned concurrency, a different feature, does cost money. Do not
confuse them.)

And the quotas page warns:

> "**New AWS accounts have reduced concurrency and memory quotas for Lambda Functions** and Lambda
> MicroVMs. AWS raises these quotas automatically based on your usage."
> - https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html (accessed 2026-08-08)

The default `Concurrent executions` quota is 1,000. **This account was created on 2026-08-05, three
days before this research**, so it may be on a reduced profile.

**Check: Service Quotas, Lambda, `Concurrent executions`, current applied value.** Two outcomes:

| Applied quota | Consequence |
|---|---|
| **1,000 (default)** | Everything below stands. Reserving 2 for report and 1 for mint leaves 997 unreserved, far above the 100 floor |
| **Above 102** | Still fine. Reserve report=2, mint=1, and confirm the unreserved remainder stays at or above 100 |
| **102 or below** | **`PutFunctionConcurrency` will be rejected and tier 0 controls 2 and 6 do not exist.** Fall back: the account quota is itself a de facto ceiling of `quota x 10` RPS, so redo the 5.3 table at that number. At a quota of 50 the ceiling is 500 RPS, which is **$130/month** worst case, six times worse than N=2 |

Two things worth saying about the fallback case. First, an AWS-set quota is a **worse** cap than a
self-set one, not a better one, because it is far higher than anything this app needs. Second, AWS
"raises these quotas automatically based on your usage", so **it is a ceiling that silently
loosens over time**, which is the opposite of what a cost guardrail should do. If the quota is
reduced today, plan to set reserved concurrency the moment it rises past 102, and put that on the
launch checklist rather than trusting the low quota as protection.

The same 100-unit floor also means **reserved concurrency is a finite budget across all functions**.
The ingest Lambda (`08` §10.2 item 1 wants reserved concurrency 2 there too), the build Lambda, the
breaker, the mint function and the report function all draw from it. At a 1,000 quota that is a
non-issue. At a reduced quota it is a real allocation problem.

### 5.1 The fact the whole answer rests on

A throttled request is **not billed**. This is stated directly in the Lambda metrics
documentation, and it is the single most load-bearing citation in this file:

> `Invocations` — The number of times that your function code is invoked ... **Invocations aren't
> recorded if the invocation request is throttled** or otherwise results in an invocation error.
> **The value of `Invocations` equals the number of requests billed.**
>
> `Throttles` — The number of invocation requests that are throttled. ... **Throttled requests and
> other invocation errors don't count as either `Invocations` or `Errors`.**
>
> - https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html (accessed 2026-08-08)

Billed requests equal `Invocations`. Throttles are not `Invocations`. Therefore **a 429 from a
Function URL costs $0.00 in Lambda request and duration charges.** An attacker sending 10,000
requests per second against a function with reserved concurrency 2 pays for all of it in their own
bandwidth and gets 429s that cost us nothing in compute.

That inverts the usual serverless fear. Reserved concurrency is not a throttle that queues work
and bills for it. It is a free front door that says no.

### 5.2 Prices used

| Item | Price | Source, accessed 2026-08-08 |
|---|---|---|
| Lambda always-free tier | "**one million requests and 400,000 GB-seconds per month**", no expiry | https://aws.amazon.com/lambda/pricing/ |
| Lambda requests | "**$0.20 per one million requests**" | same |
| Lambda duration, x86 | "**$0.0000166667 per GB-s**" | same |
| Function URLs | No separate charge, included in standard Lambda request and duration charges | same |

### 5.3 Worst case with reserved concurrency N

Max RPS through the URL is 10 x N (cited in section 4). A 30 day month is 2,592,000 seconds.
Max billed invocations per month is therefore `10 x N x 2,592,000`.

Assumes the write handler is 128 MB (0.125 GB) and runs in 50 ms billed. Both are realistic for a
handler that validates a small JSON body and does one DynamoDB write.

| Reserved concurrency N | Max RPS | Max billed invocations/month | Request charge after 1M free | GB-s used | Duration charge after 400,000 free | **Worst case /month** |
|---|---|---|---|---|---|---|
| **1** | 10 | 25,920,000 | $4.98 | 162,000 | $0.00 | **$4.98** |
| **2** | 20 | 51,840,000 | $10.17 | 324,000 | $0.00 | **$10.17** |
| **5** | 50 | 129,600,000 | $25.72 | 810,000 | $6.83 | **$32.55** |
| **10** | 100 | 259,200,000 | $51.64 | 1,620,000 | $20.33 | **$71.97** |
| **0** | 0 | 0 | $0.00 | 0 | $0.00 | **$0.00** |

Arithmetic shown for N=2: `20 x 2,592,000 = 51,840,000` invocations. `(51,840,000 - 1,000,000) /
1,000,000 x $0.20 = $10.17`. `51,840,000 x 0.125 GB x 0.05 s = 324,000 GB-s`, under the 400,000
free allowance, so $0.00 duration.

### 5.4 The three things this table teaches

1. **Reserved concurrency bounds the rate of spend, not the total.** A month-long sustained flood
   at the N=2 ceiling costs about **$10**, not $0. It trips the $20 alarm territory. So reserved
   concurrency alone is **not** a $0 guarantee, and research 08 §10.2 overstates it by calling it
   "a hard ceiling on Lambda spend rate" without doing this multiplication. It is a ceiling on the
   rate. The month-long integral is the number that matters.
2. **Handler duration is a cliff.** At N=2 and 50 ms the duration is free. At 200 ms the same
   attack costs `51,840,000 x 0.125 x 0.2 = 1,296,000 GB-s`, minus 400,000 free, times
   $0.0000166667 = **$14.93 extra**. So a slow handler roughly triples the worst case. Keep the
   write handler under about 60 ms billed, 128 MB, and do not call anything slow inside it.
3. **N above about 3 leaves the budget.** Do not "give it headroom". Headroom is the attack
   surface.

### 5.5 Why N=2 does not hurt real users, and why decision 26 is the reason

20 RPS is 1,728,000 accepted writes per day. The real ceiling is roughly 500 WhatsApp group
members reporting a handful of times each, so single digit writes per second at the 5:40am peak in
the worst realistic case.

The offline queue (decision 26) is what makes a 429 harmless. A rejected report is **not lost**, it
stays in the queue and retries with backoff. That is a genuinely nice interaction between two
decisions made for unrelated reasons. Write it into the client contract explicitly:

> **429 is not an error state in the UI.** It means "still queued". The user sees the same pending
> state they see with no signal. There is no toast, no retry button, no red.

This also means the throttle can be set aggressively low without ever producing a user-visible
failure, which is not true for a normal synchronous API.

---

## 6. The free circuit breaker: alarm to concurrency zero

$10 worst case is not $0. The gap is closed by reacting, and the reaction is free.

**Mechanism:** CloudWatch alarm on the write function's `Invocations` (Sum, 5 minute period)
crossing a threshold, to SNS, to a tiny Lambda that calls `PutFunctionConcurrency` with
`ReservedConcurrentExecutions: 0`. Section 4 already cites AWS saying that setting reserved
concurrency to zero deactivates the function URL and returns 429 to everything.

| Property | Value |
|---|---|
| Cost | **$0.00.** CloudWatch always-free includes **10 alarm metrics** and 10 custom metrics (https://aws.amazon.com/cloudwatch/pricing/, via `08` §10.3, accessed 2026-08-08). `Invocations` is a free built-in Lambda metric ("there's no additional charge for these metrics", https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics.html, accessed 2026-08-08). SNS free tier covers the notification. The breaker Lambda fires a handful of times a year |
| Detection delay | Lambda sends metrics at 1 minute intervals. With a 5 minute period and 1 datapoint to alarm, expect roughly 5 to 7 minutes end to end |
| Cost accrued during the delay | At the N=2 ceiling, 7 minutes is 8,400 invocations, about **$0.0017**. Rounds to nothing |
| Blast radius | **Writes only.** The static site is S3 plus CloudFront and is untouched. Reads, forecasts, the scorecard, the whole product keeps working. Reports queue on device |
| Recovery | Manual `PutFunctionConcurrency` back to 2, or an EventBridge Scheduler rule that restores it after N hours. EventBridge Scheduler free tier is 14,000,000 invocations/month (https://aws.amazon.com/eventbridge/pricing/, via `08` §1.3) |
| Failure mode | A legitimate viral spike looks identical to an attack and takes writes offline. Mitigated by the offline queue, which is exactly the "come back later" behavior we want anyway |

**Threshold setting, and this is where constraint 5 bites.** A burst of writes from one device is
normal traffic (decision 26). So the threshold must be set on aggregate volume, not on per-device
rate. Suggested day one value: **3,000 invocations in 5 minutes** (10 RPS average). That is roughly
100x a plausible real peak for a 500 person community and still 1/3 of the N=2 ceiling, so the
breaker fires well before the meter moves.

### 6.1 Why AWS Budgets actions are the backstop, not the breaker

Research 08 §10.1 already establishes the key limitation and it is correct:

> "**AWS Budgets sends an email. It does not stop spending.** Budget data also refreshes only a few
> times per day, so even Budgets *Actions* are a **delayed backstop, not a circuit breaker.**"
> Source: `08` §10.1, citing https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/ (accessed 2026-08-08)

Pricing from the same source: budget monitoring is free, and the **first two action-enabled budgets
per month are free**, $0.10/day for each additional one. Budget Actions can attach an IAM deny
policy or an SCP.

| | CloudWatch alarm to concurrency 0 | AWS Budgets action |
|---|---|---|
| Reaction time | ~5 to 7 minutes | Hours. Budget data refreshes a few times a day |
| Signal | Request volume, before any money is spent | Dollars already spent |
| Blast radius | One function's write path | Whatever the IAM deny policy covers. Easy to make far too broad and take the site down |
| Cost | $0.00 | $0.00 for the first two action-enabled budgets |
| Verdict | **Day one primary** | **Keep as the $18 backstop.** Scope its deny policy narrowly, to `lambda:InvokeFunctionUrl` on the write functions, not to a blanket account deny |

Blast radius warning worth stating loudly: a Budgets action that attaches a broad deny policy can
break the ingest job and the site build, which would silently stop the prediction log. Per
`HANDOFF.md` §3 the prediction log is the one thing that cannot be reconstructed later. **A cost
guardrail that stops the prediction log is more damaging than the bill it prevented.** Scope it to
the write path only.

---

## 7. CloudFront in front of the write path: it makes an attack more expensive, not less

Research 08 §3.4 recommends routing `/api/report` through the CloudFront distribution with OAC.
For reads that is right. For the write path it is backwards on cost, and this is the least obvious
finding in this file.

**Prices, https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/ (accessed 2026-08-08):**

| Item | Value |
|---|---|
| Always free | "1 TB of data transfer out to the internet per month", "10,000,000 HTTP or HTTPS Requests per month", "2,000,000 CloudFront Function invocations per month" |
| HTTPS requests, North America | "$0.0100" per 10,000, which is **$1.00 per million** |
| HTTPS requests, South America | "$0.0220" per 10,000, which is **$2.20 per million** |
| Data transfer out, North America, next 9 TB after the free 1 TB | "$0.085" per GB |

**The comparison per rejected request:**

| Front door | What a rejected attack request costs | Marginal cost per million rejected |
|---|---|---|
| **Function URL direct, throttled 429** | No Lambda request charge (section 5.1), no duration charge. Only the bytes of the 429 response leaving AWS | **about $0.04**, and $0.00 while inside the 100 GB/month free internet egress allowance. See caveat below |
| **CloudFront in front** | A billed CloudFront request, plus CloudFront egress, plus the same Lambda behavior behind it | **$1.00 (NA) to $2.20 (SA)** once the 10M free requests are consumed |

That is roughly **25x to 55x more expensive per rejected request** to have CloudFront in the path.
Worse, the attack eats the same 10,000,000 free request allowance the actual website depends on, so
a write-path flood degrades the read path's free tier. The two paths should not share a meter.

**Caveat, flagged honestly:** whether AWS meters data transfer out for a 429 emitted by the Lambda
service front door (as opposed to bytes your function returns) is **not stated in the pricing
page** and I could not find a first-party sentence either way. Bound it both ways: if it is free,
rejected requests cost exactly $0.00. If it is metered at the standard internet egress rate with a
~400 byte response, one billion rejected requests is about 400 GB, which after the 100 GB/month
free allowance is roughly **$27** at $0.09/GB. Even the pessimistic bound is far below the
CloudFront path's $1,000 for the same billion requests. **Verify before launch; it does not change
the recommendation, only the size of the residual.**

**What is genuinely lost by keeping writes off CloudFront:**

| Lost | Cost of losing it | Fix |
|---|---|---|
| Single domain, no CORS preflight | An OPTIONS preflight per new origin, and a second hostname in the client | Configure CORS on the function URL itself (native, free, section 4). Set `AllowOrigins` to the site origin exactly, never `*` |
| Origin Access Control hiding the Lambda URL | Nothing real. **The repo is public and the URL ships in the client bundle** (constraint 7). It was never hidden | Accept. Treat the URL as public by construction |
| One TLS cert and one place to attach WAF later | Only matters if WAF is ever bought, which section 2 rules out | If the day comes, flip the write path behind CloudFront then and buy the flat Pro plan at $15/month |
| CloudFront absorbing a read flood | Not applicable. Writes are uncacheable by definition, CloudFront caches nothing on a POST | No loss |

**Verdict: keep `/*` on CloudFront and put `/api/report` on a bare Function URL with auth type
`NONE`, CORS locked to the site origin, and reserved concurrency 2.** This contradicts `08` §3.4
and the contradiction is deliberate. Flag it to whoever writes `docs/design/03-infrastructure.md`.

---

## 8. AWS Budgets actions

Covered in section 6.1. Summary: free for the first two action-enabled budgets, too slow to be a
circuit breaker, keep one at $18 with a narrowly scoped deny on the write functions only.

---

## 9. DynamoDB: provisioned fails closed, on-demand fails open

This is the second free hard cap in the stack and it is easy to get backwards.

**Prices, both accessed 2026-08-08:**

| Mode | Price | Source |
|---|---|---|
| **Provisioned** | "$0.00065 per WCU-hour", "$0.00013 per RCU-hour" (US East N. Virginia) | https://aws.amazon.com/dynamodb/pricing/provisioned/ |
| **On-demand** | "**$0.6250 per million writes**", "$0.125 per million reads" | https://aws.amazon.com/dynamodb/pricing/on-demand/ |
| **Free tier, both pages** | "**25 WCUs, 25 RCUs**" and "**25 GB of data storage**" ... "each month on a per Region, per-payer account basis" | both pages |

**The behavioral difference is the whole point:**

| | Provisioned at 25 WCU | On-demand |
|---|---|---|
| Behavior past the limit | **Throttles.** `ProvisionedThroughputExceededException`, the write is rejected | **Serves it and bills it** |
| Cost of an attack that gets past Lambda | **$0.00.** The free 25 WCU is never exceeded because it cannot be | 51,840,000 writes at $0.6250 per million is **$32.40** |
| Failure mode | Fails closed. Some legitimate writes rejected under extreme load | Fails open. The bill is the only limit |

**Recommendation: provisioned capacity at exactly the free tier, 25 WCU and 25 RCU.** Not
on-demand. This is a cost control disguised as a pricing choice.

**The arithmetic lines up almost perfectly with section 5:** reserved concurrency 2 caps the write
path at 20 requests per second. 25 WCU is 25 writes per second of items up to 1 KB. So the Lambda
throttle sits just below the DynamoDB throttle, and Lambda absorbs the rejection first, which is
the cheaper of the two places to say no. Keep that ordering when tuning either number.

**Caveat on batch sync (constraint 5):** one sync request can carry several queued reports, so one
invocation can consume several WCU. Ten queued reports in one request is 10 WCU for that second.
That is fine at 25 WCU for normal traffic, but it means the two ceilings are not exactly aligned
and the DynamoDB side can throttle first during a genuine mass sync. Handle it the same way as the
Lambda 429: partial success, unwritten items stay queued on device, retry with backoff. **Never
drop a report because of a throttle.**

---

## 9b. The second meter: CloudWatch Logs

Every accepted invocation writes platform log lines. This is a real attack cost surface and it is
easy to miss.

**Price, https://aws.amazon.com/cloudwatch/pricing/ (accessed 2026-08-08):** always-free is
"5 GB Data (ingestion, archive storage, and data scanned by Logs Insights queries)", "10 Alarm
metrics", "10 Metrics (of Custom Metrics and Detailed Monitoring Metrics)". Paid ingestion is
**$0.50 per GB**, archive storage **$0.03 per GB-month**.

At the N=2 ceiling, 51,840,000 invocations at roughly 250 bytes of platform log lines each is about
**13 GB per month**. Minus the 5 GB free, that is 8 GB at $0.50 = **$4.00**. So a month-long
sustained flood costs about $10.17 in Lambda plus about $4.00 in logs.

Controls, all free:
- **7 day retention on every log group, set in IaC.** The default is Never Expire. `08` §10.3
  already calls this the number one way free serverless projects start costing money.
- **Log nothing per successful write.** No request echo, no body dump. Log only rejections and
  errors, sampled.
- Lambda advanced logging controls can lower the system log level. **UNVERIFIED:** I could not
  retrieve the AWS page that states whether `WARN` suppresses the per-invocation platform lines.
  Do not assume it does. Treat 250 bytes per invocation as the planning number.

---

## 10. Proof of work instead of captcha

### 10.1 What it is and why it fits the constraints

The client is given a random salt and a target. It brute-forces a counter until
`SHA-256(salt + counter)` matches. The server checks one hash. No login, no email, no puzzle, no
third party, no cookie. That satisfies constraint 3 in a way that no captcha does.

ALTCHA is the reference open-source implementation of exactly this scheme (GDPR, WCAG 2.2 AA,
self-hosted, MIT-adjacent licensing, https://altcha.org/, https://github.com/altcha-org/altcha,
accessed 2026-08-08).

### 10.2 The honest cost on a cheap phone

ALTCHA publishes device benchmarks at complexity 100,000
(https://altcha.org/docs/v2/complexity/, accessed 2026-08-08):

| Device | Time to solve at complexity 100,000 |
|---|---|
| MacBook Pro M3-Pro (2023) | **0.33 s** |
| iPhone 12 mini (2020) | **0.83 s** |
| AWS EC2 c6a.xlarge | **1 s** |
| **Samsung Galaxy A14 (2023), a cheap Android** | **2.5 s** |
| AWS Lambda (1 GB) | 8 s |

The docs say it plainly: "what takes less than a second on a new iPhone, might take 30 seconds on
a low-end Android phone."

**On 3G specifically:** the solve is pure CPU, so network speed does not affect it. 3G adds a round
trip to fetch the challenge, which is the same latency the report POST already pays. **The failure
mode on a cheap Android is not the network, it is the CPU, and it is a hot phone in direct
sunlight with the screen at full brightness getting slower as it thermally throttles.** Anyone
designing this should assume the field device is a several-year-old Android at 40 degrees C on a
beach, not the phone on the developer's desk.

### 10.3 The three design rules that make it invisible

1. **Put the puzzle on credential minting, never on report submission.** Solved once at first
   visit, not per report. This is also the only way it survives decision 26: ten queued reports
   would otherwise be ten puzzles on a phone that just regained signal.
2. **Solve it in a Web Worker at first page load, while the user is reading the forecast.** The
   user is on the site for tens of seconds before they ever tap report. A 2.5 second background
   solve inside that window is genuinely invisible.
3. **Do not ship the ALTCHA widget.** It is "about 30 kB" gzipped
   (https://medevel.com/altcha/, accessed 2026-08-08; a comparison at
   https://privatecaptcha.com/blog/self-hosted-captcha-comparison/ says 34 kB min+gzip). That is
   **a third of the entire 100 KB page budget** in decision 27. Implement the protocol directly
   with `crypto.subtle.digest` in about 30 lines and under 1 KB. Use the algorithm, not the widget.

### 10.4 How an attacker defeats it, stated honestly

Compute the ratio from ALTCHA's own numbers. The Galaxy A14 does 100,000 hashes in 2.5 s, which is
**about 40,000 hashes per second** in the browser. A single modern x86 core with SHA-NI does short-
message SHA-256 in the low tens of millions per second, and a GPU does billions.

| Attacker | Speed advantage over the cheap Android | Cost to mint 1,000 identities |
|---|---|---|
| One CPU core, native code | roughly **300x to 500x** | a few seconds |
| One consumer GPU | roughly **10,000x to 100,000x+** | milliseconds |

**So proof of work buys two to three orders of magnitude against a CPU and roughly nothing against
a GPU.** Argon2 or scrypt are memory-hard and cut the GPU advantage, and ALTCHA supports them as
separately imported workers, but they cost far more phone time and far more kilobytes. Both break
constraint 8 before they fix the problem.

**The verdict is narrow and should be stated as such: proof of work turns a one-line `curl` loop
into a program someone has to actually write. It does not stop anyone who is willing to spend an
afternoon.** For a free community surf site that is probably the right amount of protection, but
call it what it is.

### 10.5 The critical limitation: PoW does not stop the cost attack

Verifying the proof requires running the handler. The handler is the resource under attack. So
every verification is a billed invocation, and PoW **adds** cost per request rather than removing
it. It can only reduce cost if verified before Lambda, which means at the edge, which means
CloudFront Functions, which means every request bills at CloudFront rates (section 7) and is
strictly worse.

**Therefore: proof of work is a control for threats 2 and 3 (poisoning, nuisance). It is not a
control for threat 1 (cost). Reserved concurrency is the control for threat 1, and it already
works without knowing anything about the caller.**

---

## 11. Anonymous device identity: what is real and what is theatre

Constraint 7 is decisive. The repo is public and the client bundle ships to every visitor, so a
device id generated on the client is a number the attacker chooses.

| Approach | Real or theatre | Why |
|---|---|---|
| Client-generated UUID in localStorage | **Theatre** | The attacker reads the source, mints a fresh UUID per request. Zero cost to forge. Useful only for honest-user continuity, which is a real and separate purpose |
| Browser fingerprinting (canvas, fonts, UA) | **Theatre, and worse** | Trivially spoofed by anyone scripting, while breaking privacy for honest users and adding kilobytes. Also a poor fit for a project whose ethos is open and unmonetized |
| IP address as identity or rate-limit key | **Theatre, and actively harmful** | Panama runs heavy carrier-grade NAT, so one mobile IP can be a whole town at the beach. An IP limit punishes an entire community while an attacker rotates through cloud IPs for cents. **Wrong on both sides. Do not build it** |
| CORS `AllowOrigins` | **Theatre against attackers** | Enforced by browsers only. `curl` ignores it. Still worth setting, because it stops casual embedding, but it is not a defense |
| **Server-minted HMAC-signed credential** | **Real, partially** | The server generates the id and signs it with a key that never leaves Lambda. The client cannot forge one, it can only ask for more. Cost to forge is zero, cost to obtain is one request |
| **Server-minted credential gated by proof of work** | **Real, bounded** | Now each identity costs CPU. Section 10.4 sizes the bound honestly: a few hundred x against a CPU, nothing against a GPU |
| **Credential age and history as the trust signal** | **The strongest free lever** | An attacker can mint identities cheaply but **cannot make them old**. Time is the one resource that cannot be bought with CPU, forged from a public repo, or scripted |
| Private Access Tokens / Privacy Pass | **Real but out of reach** | Genuine anonymous device attestation, IETF standardised. But it works in Safari and not in Chrome or Firefox without an extension (https://www.privacyguides.org/articles/2025/04/21/privacy-pass/, accessed 2026-08-08), and the origin must implement token verification against issuer keys. Half the Android audience is uncovered. **Revisit in a few years** |
| WebAuthn / passkey as an anonymous device key | **Real but violates constraint 3** | A passkey is device-bound and unforgeable, but creating one raises a biometric prompt. That is friction at exactly the moment decision 11 protects |

### 11.1 The recommended identity design

```
first visit         → POST /api/mint  (no body)
                      server returns { challenge_salt, target }
                      client solves in a Web Worker while the user reads the forecast   [tier 2 only]
                      POST /api/mint with the solution
                      server verifies, returns credential = base64( id | issued_at | HMAC(key, id|issued_at) )
                      client stores it in IndexedDB

every report        → POST /api/report with the credential in a header
                      server verifies the HMAC in microseconds, no database read needed
                      server records: report, credential id, credential issued_at, server receive time
```

Properties worth stating:
- **No PII ever touches the write path.** `id` is server-generated random. There is no email, no
  phone, no name unless the user later claims one (decision 11's second half).
- **Signature verification needs no database lookup**, so the handler stays under the 60 ms budget
  that section 5.4 shows is load-bearing for the worst-case bill.
- **Claiming a name later is a merge on `id`**, which is exactly what decision 11 promises and what
  `HANDOFF.md` §4 asks `01-data-architecture.md` to design.
- **`issued_at` is signed**, so credential age cannot be backdated by the client.

### 11.2 What this does to the "at least 5 distinct reporters" gate

Research 09 §13.4 gate 1 is: apply no correction until `n_s >= 10` **and** `distinct_reporters >= 5`.

**Stated plainly: with anonymous, attacker-mintable credentials, "5 distinct reporters" as written
is theatre.** One person with a script is five reporters. The gate as specified provides no
protection at all against a deliberate attacker. It still does useful work against accidental
single-user overweighting, which is what it was probably designed for, but it must not be described
as an anti-gaming control.

**The repair, which costs the honest user nothing:** redefine distinctness in terms of things an
attacker cannot mint instantly.

> `distinct_reporters >= 5` becomes
> **5 distinct credentials, each at least `A` days old, each with at least `M` prior reports at
> two or more different spots.**

An attacker can still beat this. They just have to start three weeks early and behave normally in
the meantime. That is a completely different class of adversary from a bored person with `curl`,
and moving the bar from seconds to weeks is the largest single improvement available for free.

---

## 12. External free tiers worth considering

| Service | Cost | Fit | Verdict |
|---|---|---|---|
| **Cloudflare Turnstile** | Free. "Turnstile's 'Managed' mode is now **completely free to everyone for unlimited use**" and Cloudflare "decoupled Turnstile from our platform so that any website operator on any platform can use it just by adding a few lines of code" (https://blog.cloudflare.com/turnstile-ga/, accessed 2026-08-08). Advanced features sit below a 1,000,000 siteverify request limit | Real, and it costs $0. But: third-party JS on a 100 KB budget, a third-party dependency in an MIT open-source project, and **a server-side siteverify HTTP call inside the write handler** | **Hold in reserve, tier 3.** See the trap below |
| hCaptcha / reCAPTCHA | Free tiers exist | Both show interactive challenges, which is friction at the report moment | **Reject on constraint 3** |
| Upstash / other hosted rate limiters | Free tiers exist | Adds a network round trip inside the handler, same trap as below, plus another dependency | **Reject** |
| GitHub (already a dependency per `08` §14.3) | Free on public repos | Not a request-path service | Not applicable |

**The Turnstile trap, and it is not obvious.** Section 5.4 shows the worst-case Lambda bill is
roughly proportional to handler duration. A siteverify call to `challenges.cloudflare.com` from
inside the write handler adds a TLS round trip, realistically 100 to 300 ms. That takes the handler
from 50 ms to 250 ms and **triples to quadruples the duration component of the worst-case bill**,
turning a $0.00 duration charge into roughly $15 at the N=2 ceiling. A free anti-abuse service that
makes the cost attack more expensive is a bad trade against threat 1.

If Turnstile is ever switched on, put it on **credential minting only** (a rare, once-per-device
call on a separate function with its own reserved concurrency of 1), never on report submission.
Same rule as proof of work, same reason.

---

## 13. Ranked options

Ordered by value for money, where the currency is dollars, user friction, and kilobytes.

| # | Option | Stops | Dollar cost | User friction | KB | How an attacker defeats it | Worth doing? |
|---|---|---|---|---|---|---|---|
| 1 | **Reserved concurrency 2 on the write function** | Threat 1. Caps accepted rate at 20 RPS, rejects the rest free | **$0.00** | None. 429 means "still queued" (decision 26) | 0 | Cannot. They can only waste their own bandwidth. They *can* deliberately fill the 20 RPS to deny service to others | **Yes. Day one. Non-negotiable** |
| 2 | **DynamoDB provisioned at the free 25 WCU / 25 RCU, not on-demand** | Threat 1. Removes a $32/month fail-open meter | **$0.00** | None until throttled, then the report stays queued | 0 | Cannot | **Yes. Day one** |
| 3 | **CloudWatch alarm to `PutFunctionConcurrency(0)` breaker** | Threat 1. Turns a $14/month sustained attack into cents | **$0.00** (inside 10 free alarm metrics) | None. Writes queue, reads keep working | 0 | Trigger it deliberately to deny writes to everyone. Cheap self-DoS, costs us nothing but availability | **Yes. Day one** |
| 4 | **7 day log retention + log nothing on success** | Threat 1, second meter. Caps a $4/month log bill | **$0.00** | None | 0 | Cannot | **Yes. Day one** |
| 5 | **Write path NOT behind CloudFront** | Threat 1. Avoids paying $1.00 to $2.20 per million rejected requests | **$0.00**, saves money | One CORS config, one extra hostname | 0 | Nothing to defeat | **Yes. Day one** |
| 6 | **Small payload cap enforced at line one of the handler** | Threat 3, and a little of threat 1 (shorter duration) | **$0.00** | None. A 3-tap report is a few hundred bytes | 0 | Send exactly-at-limit bodies | **Yes. Day one** |
| 7 | **Server-minted HMAC credential, no PoW** | Nothing on its own. Enables 8, 9, 10 | **$0.00** | None, invisible | <1 | Request more credentials | **Yes. Day one, as plumbing** |
| 8 | **Credential age + history weighting in the learning layer** | Threat 2. Moves the attacker's cost from seconds to weeks | **$0.00** | None. Honest users never learn it exists | 0 | Age credentials for three weeks first | **Yes, but see 16.3 on when to switch it on** |
| 9 | **Clamp, shrinkage, median, per-user offset (09 §13.4 and §13.5c)** | Threat 2. Bounds the damage rather than preventing it | **$0.00** | None | 0 | Accept the bounded damage and repeat it across many spots | **Yes. Already specified in research 09** |
| 10 | **Burst / low-variance coordination detector at ingest** | Threat 2. Catches naive scripted poisoning | **$0.00** | None | 0 | Add jitter and realistic variance. Easy to defeat if you know it exists, and the repo is public | **Yes, cheap. Do not overrate it** |
| 11 | **Budgets action at $18, narrowly scoped** | Threat 1 backstop only | **$0.00** (first two action-enabled budgets free) | None | 0 | Nothing, but it reacts in hours not minutes | **Yes, as a backstop with a narrow deny scope** |
| 12 | **Proof of work on credential minting** | Threats 2 and 3. Raises Sybil cost a few hundred x on CPU | **$0.00** | ~2.5 s background solve on a cheap Android, once, in a worker | <1 hand-rolled, 30 KB if the ALTCHA widget is used | GPU, or just one CPU core | **Hold in reserve, tier 2** |
| 13 | **Cloudflare Turnstile on minting only** | Threats 2 and 3, harder than PoW | **$0.00** | Usually invisible, occasionally an interactive challenge | third-party script, plus a siteverify round trip | Solver services exist and are cheap | **Hold in reserve, tier 3** |
| 14 | **Delete the function URL config** | Everything, absolutely | **$0.00** | Writes fully offline, reports keep queueing | 0 | Nothing. This is the nuclear option | **Hold in reserve. The only control that also stops response bytes** |
| 15 | **CloudFront flat Pro plan** | Threat 1 at any scale, bundles WAF and bot management | **$15.00/month per distribution** | None | 0 | Nothing meaningful | **Break glass only. Breaks constraint 1 while it is on** |
| 16 | **AWS WAF rate-based rules** | Threat 1 and some of 3 | **$5.00/mo ACL + $1.00/mo per rule + $0.60/M requests** | None | 0 | Rotate IPs | **No. $7.00/month at zero traffic** |
| 17 | **Require login before posting (research 08 §8.3)** | Threats 2 and 3, meaningfully | $0.00 in AWS terms, **SES pricing unverified per `08` §8.3** | **Kills decision 11** | 0 | Sign up with throwaway emails, which is cheap and automatable | **No. Forbidden by constraint 3, and it does not even fix threat 1** |
| 18 | **IP-based rate limiting** | Almost nothing here | $0.00 to build | Blocks whole towns behind carrier NAT | 0 | Rotate cloud IPs for cents | **No. Wrong on both sides** |

## 14. Recommended layered default

### 14.1 Tier 0, ships with the write path on day one

All eleven items are free, all are invisible to an honest user, none require identity.

| # | Control | Concrete value |
|---|---|---|
| 1 | Lambda Function URL, auth type `NONE` | Not behind CloudFront. CORS `AllowOrigins` set to the exact site origin, never `*` |
| 2 | **Reserved concurrency = 2** on the report function | Caps accepted traffic at 20 RPS. Everything above is a free 429 |
| 3 | Handler budget | 128 MB memory, **5 second timeout** (never leave 900), target under 60 ms billed. No outbound HTTP calls inside the handler |
| 4 | Payload cap | Reject anything over ~4 KB on the first line, before JSON parsing. The 6 MB Function URL default is 1,500x more than a 3-tap report needs |
| 5 | **DynamoDB provisioned 25 WCU / 25 RCU** | Exactly the free tier. Never on-demand. Fails closed |
| 6 | **Circuit breaker** | CloudWatch alarm, `Invocations` Sum over 5 minutes > 3,000, to SNS, to a breaker Lambda calling `PutFunctionConcurrency(0)`. EventBridge Scheduler restores it after 6 hours |
| 7 | Log discipline | 7 day retention on every log group, set in IaC. Nothing logged on a successful write |
| 8 | Budgets | Alerts at $1, $5, $15. One action-enabled budget at $18 whose deny policy is scoped to `lambda:InvokeFunctionUrl` on the write functions only, never a blanket account deny |
| 9 | **Server-minted HMAC credential** | Issued on first visit with no puzzle. Random server-side id, signed `issued_at`, no PII. Stored in IndexedDB |
| 10 | Client contract | **429 is not an error.** The report stays in the offline queue and retries with backoff. No toast, no red, no retry button |
| 11 | Immutable raw reports | Store every report as received. The learned correction is a derived artifact that can be recomputed with any reporter down-weighted or excluded. **This is what makes threat 2 recoverable** |
| 12 | **`/api/mint` gets its own reserved concurrency of 1 and its own breaker alarm** | It is a second open, anonymous, unauthenticated Function URL. See 14.1a. **An unconfigured function draws from unreserved account concurrency, so its spend rate is capped by AWS's quota rather than by us** |
| 13 | Mint ledger | Write one small item per minted credential: `(id, issued_at)`. See 14.1a for why |
| 14 | Precondition check | Confirm the account `Concurrent executions` quota allows reserved concurrency at all (section 5.0). **Do this before anything else. If it fails, controls 2, 6 and 12 do not exist** |

### 14.1a The mint endpoint is a second write path, and it is easy to forget

`/api/mint` (section 11.1) is anonymous, unauthenticated, and open by construction, exactly like
`/api/report`. Everything in sections 5, 6 and 9 applies to it identically. Two specifics:

- **Reserved concurrency 1 is plenty.** Minting is once per device, ever. 10 RPS is 864,000 new
  devices per day. Its own CloudWatch alarm should be far more sensitive than the report path's,
  because a legitimate spike in *minting* has no equivalent of the offline-queue explanation.
- **A stateless HMAC credential means the server has no idea how many it has issued.** That is the
  price of the no-database-lookup design that section 5.4 needs for handler speed. Without a
  record, mass minting is invisible, credentials cannot be counted, and a specific credential
  cannot be revoked. **Fix it on the mint side, not the verify side:** write one item per mint,
  `(id, issued_at)`, at 1 WCU, well inside the free 25 WCU. Verification stays a pure HMAC check
  with no read. That buys detection and revocation without touching the hot path.

### 14.2 Held in reserve, each behind a named trigger

| Tier | Control | Trigger | Time to deploy | Visible friction |
|---|---|---|---|---|
| 1 | Lower reserved concurrency to 1, raise breaker sensitivity | Repeated breaker trips | seconds, one API call | None |
| 2 | **Proof of work on credential minting** (hand-rolled, under 1 KB, Web Worker, complexity tuned to ~1 s on a Galaxy A14) | Evidence of scripted mass minting or a poisoning event | Needs to be built, so build it early and leave it switched off behind a server-side flag | None if it runs at first page load |
| 3 | **Turnstile managed mode on minting only** | PoW defeated, sustained gaming | hours | Occasional interactive challenge, at minting, never at report time |
| 4 | **Delete the function URL config** | A flood large enough that even free 429 responses are a concern (see 15.3) | seconds | Writes offline entirely. Reports keep queueing. Reads unaffected |
| 5 | **CloudFront flat Pro plan, $15/month** | A sustained targeted attack that survives tiers 0 to 4 | minutes, per-distribution setting | None. **Breaks constraint 1 for as long as it is on. Turn it off after** |
| 6 | Optional magic-link claim, for extra trust weight only | Never triggered by attack. It is decision 11's own "claim a name later" | later | None. **Always optional. Never required to report** |

Note the ordering. Everything up to tier 4 is free. The first thing that costs money is tier 5, and
it is a temporary purchase during an active attack, not an architecture.

### 14.3 Worst-case dollar figures under this default

| Scenario | Monthly cost | Working |
|---|---|---|
| Normal traffic | **$0.00** | Everything inside always-free allowances by three or more orders of magnitude |
| Attack, breaker works, attacker retries after each 6 hour auto-restore (120 episodes/month) | **$0.00 to under $1** | ~7 min detection x 20 RPS = 8,400 billed invocations per episode. 120 episodes is ~1.0M invocations, which is at the edge of the 1,000,000 free tier. Logs ~250 MB, inside the 5 GB free tier |
| Attack, breaker fails, sustained all month at the N=2 ceiling | **about $14** | $10.17 Lambda requests + $4.00 CloudWatch Logs + $0.00 DynamoDB (provisioned) + $0.00 duration (50 ms handler) |
| Same, but the handler is slow (200 ms) | **about $29** | The $14 above plus $14.93 of duration. **This is why the handler budget is a control, not a nicety** |
| Same, and 429 response bytes turn out to be metered egress at very high request rates | **potentially hundreds** | See 15.3. This is the one open question that can move the answer, and it is verifiable in an afternoon |

**Headline: with the breaker working, a cost attack costs under $1/month. With the breaker broken,
about $14/month, under the $20 alarm. The only path to a large bill is the unverified egress
question in 15.3.**

---

## 15. What this design does NOT protect against

Named honestly. A gap named is worth more than a control that only looks like protection.

### 15.1 What an attacker can actually do to the learning loop

Take the gates exactly as research 09 §13.4 specifies them: `n_s >= 10` and
`distinct_reporters >= 5`, significance gate `|b| > 2 x bias_se`, shrinkage always on, correction
clamped at about +/- 40% of forecast height, median over same-day reports (§13.5c).

| Attacker step | Does the gate stop it? |
|---|---|
| Mint 5 credentials | **No.** Free and instant at tier 0. A few seconds of CPU at tier 2. Section 11.2 |
| Submit 10 reports at one spot from those 5 credentials | **No.** Rate limits are aggregate, not per-credential, and 10 reports is normal traffic |
| Make them consistent, all "way smaller than forecast" | **No, and consistency helps the attacker.** Low variance means a small standard error, so the significance gate `|b| > 2 x bias_se` is *easier* to pass with coordinated lies than with honest noisy reports. **The significance gate rewards coordination** |
| Beat the median | **Only if they outnumber honest same-day reporters.** At a spot with 2 honest reports a day, 10 forged reports own the median |
| Move the number arbitrarily far | **Yes, the clamp stops this.** Damage is bounded at roughly +/- 40% of forecast height, and shrinkage `n/(n+tau)` cuts it further at low `n`. With `n=10` and `tau` around 10 to 20, expect the realistic achievable shift to be roughly half the clamp |
| Do it without being noticed | **Yes.** Decision 24 removes the moderation queue by design |
| Have it persist | **No.** Per-user offset estimation (09 §13.5c) grows a large `u_user` for a persistent liar and subtracts it out, and the raw reports are retained so any correction can be recomputed |

**Conclusion, stated plainly for the owner: one motivated person with a script can shift a
low-traffic spot's displayed correction by up to roughly the clamp, and can do it invisibly. The
damage is bounded, it is reversible, and it decays. It is not preventable at $0 with anonymous
reporting.** The exposure is worst at exactly the spots that matter least (low report volume) and
weakest at the busy spots that drive the product.

The realistic attacker is not a stranger. It is a local protecting a break, which research 09
§13.5c already flags as a documented cultural behaviour, and the payoff of the lie is
"under-report so nobody drives here". Note the direction: that attacker wants the score **too low**,
which is the safe direction for a user (they stay home) and the damaging direction for the accuracy
scorecard.

### 15.1a The scorecard is a softer target than the correction, and it is the differentiator

The gates analysed above (`n_s >= 10`, `distinct_reporters >= 5`) come from research 09 **§13.4**
and they gate the **learned bias correction**. The **accuracy scorecard** is a different artifact,
specified in research 09 **§13.3**, and decision 13 puts it inline on every spot page as the
product's differentiator.

Reading §13.3's schema: it carries `n_obs`, `n_distinct_reporters` ("the number that actually gates
trust"), `bias`, `bias_se`, `mae`, `rmse` and the skill scores. **It does not state a numeric
minimum before the row is displayed.** §13.2 offers guidance ("`k ≈ 4–9 distinct users` cuts
observer bias by half to two-thirds", "prefer 8 reports from 8 people over 20 reports from 2
people") but that is a design rule, not a gate. And decision 19 explicitly shows the counter from
day one ("7 / 30 reports" per spot), which means low-`n` scorecards are on screen by design.

**So the attacker's cheapest path to damaging the differentiator needs fewer reports than the path
analysed in 15.1.** At a spot with `n_obs = 3`, three forged reports own the displayed bias number
outright. The §13.4 gates never fire because they were never in this code path.

| | Learned correction (§13.4) | Displayed scorecard (§13.3) |
|---|---|---|
| Explicit numeric gate | Yes: `n >= 10` and `>= 5` distinct | **None stated** |
| Reports needed to move it | 10+ | **As few as 2 or 3 on a cold spot** |
| Damage bounded by a clamp | Yes, about +/- 40% | **No clamp specified** |
| On screen for every user | No, it is an internal adjustment | **Yes. Decision 13. It is the differentiator** |

**Recommendation for `docs/design/06-learning-layer.md`: give the scorecard its own explicit
display gate, at least as strict as §13.4's, and show "not enough data yet" below it.** Research 09
§14.4 already establishes that saying "we do not know" is the intended behaviour, and §10.4's
honesty rule and `HANDOFF.md` open item 12 ("No accuracy claim is earnable at launch") both point
the same way. This is a small specification gap with an outsized consequence, because it sits on
the one screen element the whole product is differentiated by.

### 15.2 The breaker is a free denial-of-service against ourselves

Anyone can send 3,000 requests in 5 minutes and take the write path offline for 6 hours. It costs
them nothing and it costs us nothing in dollars. **This is a deliberate trade: availability of
writes is sacrificed to protect the budget, per constraint 2.** It is survivable only because
decision 26 queues reports offline, so a 6 hour write outage is invisible to a user who is on the
beach with no signal anyway. If the offline queue is ever descoped, this trade stops being safe.

### 15.3 The one unverified question that can move the answer

Whether AWS meters internet data transfer out for a **429 emitted by the Lambda service front door**
before the function runs. The Lambda pricing page does not say. If it is metered at the standard
internet egress rate, a very large flood (10,000 requests per second sustained for a month is about
26 billion requests at a few hundred bytes each) is thousands of GB of egress and a bill in the
hundreds of dollars, and **the circuit breaker does not help, because a function at concurrency 0
still emits 429 responses.** In that case the only working control is tier 4, deleting the function
URL config, which stops response bytes entirely.

**Action: verify this before launch.** One test with a load generator and one look at the Cost
Explorer line item settles it. Until then, treat "delete the function URL" as a real runbook step,
not a theoretical one.

### 15.4 The read path is the larger exposure, and it is not in this file's scope

CloudFront always-free is 10,000,000 requests per month, then **$1.00 per million in North America
and $2.20 per million in South America** (https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/,
accessed 2026-08-08). A trivial script hitting the static site 100 million times in a month costs
roughly **$90 to $198**, and there is no free CloudFront control that stops it. Nothing in this file
protects the read path. **Flag to `docs/design/03-infrastructure.md`: the write path can be made
free under attack, the read path cannot.** The available answers there are the flat Pro plan at
$15/month or accepting the risk. This deserves its own decision.

### 15.5 Other named residuals

- **Nuisance junk is accepted, deliberately.** 25 GB of free DynamoDB storage at a few hundred
  bytes per report is tens of millions of reports. Do not spend friction on it (section 3).
- **A patient attacker with aged credentials defeats section 11.2.** The bar is weeks, not
  impossible.
- **Photos are a separate, unpriced surface.** Decision 9 makes them optional and this file did not
  price presigned-upload abuse. `08` §9.3 says photos are where the $0 breaks. **Whoever designs
  the upload path must redo this analysis for it.** A presigned PUT is a much more expensive thing
  to hand an anonymous stranger than a 400 byte JSON report.
- **Web push subscriptions (decision 12) are a second anonymous write surface** and were not
  analysed here.

---

## 16. The structural answer: is anonymous reporting compatible with $0?

### 16.1 On cost: yes, and auth would have been worse

**Anonymity costs nothing against threat 1.** Every control that actually caps spend is
identity-blind:

| Control | Does it need to know who is calling? |
|---|---|
| Reserved concurrency | No |
| Free 429 at the Lambda front door | No |
| DynamoDB provisioned capacity | No |
| Circuit breaker to concurrency 0 | No |
| Log retention | No |
| Not fronting writes with CloudFront | No |

Research 08 §10.4's "the write path is auth-gated" was never doing the work in that paragraph. The
next three bullets in the same list were.

And auth would have made the cost picture **worse**, not better:
- A session lookup per write adds a DynamoDB read and latency to the handler, and section 5.4 shows
  handler duration is roughly proportional to the worst-case bill.
- Magic links need SES, whose pricing `08` §8.3 explicitly flags as **unverified** and a candidate
  to break the $0.
- An unauthenticated `/api/auth/request` endpoint is itself an anonymous write path that can be
  flooded, and every flood sends an email. **Adding auth would have created a second, more
  expensive abuse surface than the one it was meant to protect.**

So decision 11 is not a concession the architecture has to absorb. On dollars it is the cheaper
choice.

### 16.2 On integrity: no, and here is the bill

**The cost of anonymity is paid by decision 13, the inline accuracy scorecard, which is the stated
differentiator.**

With anonymous, attacker-mintable credentials, the "at least 5 distinct reporters" gate in research
09 §13.4 does not do what its name implies (section 11.2). The accuracy number shown on every spot
page is therefore **movable by one determined person on a low-traffic spot**, and by design there is
no moderation queue to catch it (decision 24).

It is worse than that, and 15.1a is the reason. Those gates protect the learned *correction*. The
*displayed* scorecard in research 09 §13.3 has no stated numeric gate at all, so on a cold spot it
can be moved with two or three forged reports rather than ten. **The cheapest attack on this
product hits the exact screen element it is differentiated by, and it is cheap because of a
specification gap, not because of anonymity.** Closing that gap (15.1a) is worth more than any
control in section 13.

Andres has not been told this. He should be. It is not a reason to change decision 11.

### 16.3 The compromise that keeps decision 11 fully intact

Separate two things that are currently conflated:

| | Bar to clear | Visible to the user? |
|---|---|---|
| **A report is accepted, stored, and displayed** | Anonymous, zero friction, three taps, instant. **Exactly decision 11 and decision 4, unchanged** | Yes. They see their report land |
| **A report counts toward the learned bias correction and the public accuracy scorecard** | Credential age `>= A` days, `>= M` prior reports, plus every gate research 09 §13.4 already specifies | **No. Nobody sees this line** |

This is the whole compromise. The friction budget at the moment that matters stays at zero. The
learning loop gets a bar an attacker has to wait weeks to clear. An honest surfer never learns the
distinction exists, because their first reports still appear on the spot page and still get counted
once the credential ages, retroactively.

**The real price is launch speed.** Research 09 §13.4 says stage 1 needs roughly 10 to 30 reports
per spot and estimates 300 to 500 total reports, one active season. An age gate of `A` days delays
that by `A` days at minimum, and the cold-start problem is already the binding constraint on the
product's only honest claim.

**Recommended resolution: ship with `A = 0` and turn the age gate on when there is an audience worth
gaming.** The incentive to poison a surf forecast is proportional to how many people read it. At
launch, when the cold-start problem is at its worst, the attack payoff is near zero because nobody
is looking. By the time the site is worth attacking, the reports needed to reach stage 1 already
exist and the age gate costs nothing. **The two curves peak at opposite times, so run the gate as a
config value with a default that changes once, rather than as an architectural fork.** The only
requirement on day one is that the data model records `credential_id`, signed `issued_at`, and
server receive time on every report, so the gate can be applied retroactively.

### 16.4 One paragraph for the owner

Anonymous reporting is free in dollars. It costs nothing in AWS bill terms and it is actually
cheaper than requiring a login, because a login endpoint is itself something a stranger can flood
and every flood sends an email. What it costs is the ability to say the accuracy scorecard is
tamper-proof. With no login, "five different people reported this" cannot be verified, so one
person with a script is five people. The fix that keeps the three-tap flow untouched is to let
anyone post instantly while requiring a report to be a few weeks old before it moves the learned
correction. Nobody sees that rule. It just means a brand new phone cannot walk in and change a
spot's numbers on its first day.

---

## 17. Dependencies for other design docs

Flagged, not fixed. These live in files owned by other agents.

| File | What it needs to absorb from here |
|---|---|
| `docs/design/03-infrastructure.md` | **Verify the account concurrency quota first (5.0), it is a precondition for the whole design.** **Contradicts `08` §3.4:** put `/api/report` on a bare Function URL, not behind CloudFront (section 7). Reserved concurrency 2 on report and 1 on mint, 5 s timeout, 128 MB. DynamoDB **provisioned** 25 WCU / 25 RCU, never on-demand (section 9). The breaker (section 6) as IaC, on **both** write functions. Budgets action deny scope narrowed to the write functions (section 6.1). Reserved concurrency is a finite account-wide budget shared with the ingest and build Lambdas (5.0). **Read path cost exposure needs its own decision (15.4)** |
| `docs/design/07-write-path.md` | The credential mint and verify flow (11.1). **`/api/mint` is a second open write path, treat it like `/api/report` (14.1a).** Write a `(id, issued_at)` mint ledger so mass minting is detectable and credentials are revocable, without adding a read to the hot path. 429 as a queue state, never an error (5.5). Payload cap at line one. PoW built but switched off behind a server flag (14.2 tier 2). The runbook step "delete the function URL" (15.3) |
| `docs/design/06-learning-layer.md` | **The "5 distinct reporters" gate as written is not an anti-gaming control (11.2).** Redefine distinctness by credential age and history. **Give the displayed scorecard (research 09 §13.3) its own explicit numeric display gate, it currently has none (15.1a).** Note that the significance gate rewards coordinated lying (15.1). Age gate as a config value defaulting to 0 at launch (16.3) |
| `docs/design/01-data-architecture.md` | Every report record must carry `credential_id`, signed `issued_at`, and server receive time, from day one, so the age gate can be applied retroactively. Raw reports immutable, corrections derived and recomputable |
| `docs/design/02-frontend-architecture.md` | Anti-abuse client code has a KB budget too. Hand-rolled PoW under 1 KB, not the 30 KB ALTCHA widget (10.3). Turnstile's third-party script is a tier 3 decision, not a default |

---

## 18. Sources

All accessed **2026-08-08**.

**AWS primary documentation**
1. Lambda function URL configuration, throttling, auth types, CORS, deactivation - https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html
2. Lambda quotas, payload and timeout limits, invocation RPS - https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
3. **Lambda CloudWatch metric types. The `Invocations` = billed requests and throttles-are-not-invocations statement** - https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html
4. Lambda metrics are free - https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics.html
4b. **Reserved concurrency configuration. The "unreserved account concurrency minus 100" floor, "incurs no additional charges", and setting it to 0 to intentionally throttle** - https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html
4c. New AWS accounts have reduced concurrency quotas (same page as source 2) - https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html

**AWS pricing pages**
5. Lambda pricing, always-free 1M requests + 400,000 GB-s, $0.20/M requests, $0.0000166667/GB-s - https://aws.amazon.com/lambda/pricing/
6. CloudFront pay-as-you-go, 1 TB + 10M requests always free, $0.0100/10k NA, $0.0220/10k SA, $0.085/GB - https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/
7. DynamoDB provisioned, 25 WCU / 25 RCU / 25 GB free, $0.00065/WCU-hour - https://aws.amazon.com/dynamodb/pricing/provisioned/
8. DynamoDB on-demand, $0.6250 per million writes, $0.125 per million reads - https://aws.amazon.com/dynamodb/pricing/on-demand/
9. CloudWatch, 5 GB logs free, 10 alarm metrics, 10 custom metrics, $0.50/GB ingestion, $0.03/GB-month archive - https://aws.amazon.com/cloudwatch/pricing/

**Cited via research 08's same-day fetches (not re-fetched this pass, flagged as second-hand)**
10. AWS WAF pricing, $5.00/month web ACL + $1.00/month per rule + $0.60/M requests - https://aws.amazon.com/waf/pricing/
11. AWS Budgets pricing, monitoring free, first two action-enabled budgets free - https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/
12. CloudFront flat-rate plans, Free / Pro $15 / Business $200 / Premium $1,000 - https://aws.amazon.com/cloudfront/pricing/
13. API Gateway free tier is 12 months only - https://aws.amazon.com/api-gateway/pricing/
14. Cognito 10,000 MAU free on Lite and Essentials - https://aws.amazon.com/cognito/pricing/
15. EventBridge Scheduler 14M invocations/month free - https://aws.amazon.com/eventbridge/pricing/
16. The 100 GB/month aggregated internet data transfer out free allowance, noted on https://aws.amazon.com/s3/pricing/ per `08` §1.3

**Proof of work and captcha alternatives**
17. ALTCHA project - https://altcha.org/ and https://github.com/altcha-org/altcha
18. ALTCHA complexity benchmarks, including Galaxy A14 at 2.5 s for complexity 100,000 - https://altcha.org/docs/v2/complexity/
19. ALTCHA bundle size ~30 kB gzipped - https://medevel.com/altcha/
20. Self-hosted captcha size comparison, ALTCHA 34 kB min+gzip - https://privatecaptcha.com/blog/self-hosted-captcha-comparison/
21. Cloudflare Turnstile GA, "completely free to everyone for unlimited use", platform-independent - https://blog.cloudflare.com/turnstile-ga/
22. Privacy Pass / Private Access Tokens browser support reality - https://www.privacyguides.org/articles/2025/04/21/privacy-pass/

**Project internal**
23. `docs/research/raw/08-aws-architecture-and-cost.md` §1.3, §3.2, §3.3, §3.4, §8.1, §8.3, §9.3, §10.1 to §10.5, §14.3
24. `docs/research/raw/09-ai-forecast-methodology.md` §13.2, §13.4, §13.5
25. `docs/DISCUSS-decisions.md` decisions 4, 9, 11, 12, 13, 24, 26, 27, and the consequences section
26. `BRIEF.md` constraints 1 to 4. `HANDOFF.md` §3 and §4

**Confidence ratings**

| Claim | Confidence | Basis |
|---|---|---|
| Throttled Function URL requests are not billed | **High** | Primary AWS doc, explicit sentence, source 3 |
| Max RPS = 10 x reserved concurrency, 429 above it, concurrency 0 deactivates the URL | **High** | Primary AWS doc, source 1 |
| Worst-case Lambda arithmetic in 5.3 | **High** on the prices, **Medium** on the totals (depends on assumed 50 ms handler) | Sources 1, 3, 5 |
| CloudFront in front of writes is 25x to 55x more expensive per rejected request | **Medium-High** | Sources 5 and 6 are solid; the comparison depends on the unverified egress question in 15.3 |
| DynamoDB provisioned fails closed and on-demand fails open | **High** on prices (sources 7, 8), **Medium** on the throttling wording, which the pricing page does not state explicitly |
| PoW buys a few hundred x against a CPU and near nothing against a GPU | **Medium** | ALTCHA's own device benchmarks (source 18) plus a derived estimate of attacker hash rates. The 40,000 hashes/sec browser figure is derived from source 18, the attacker-side figures are not first-party |
| Turnstile managed mode is free with no request cap | **Medium-High** | First-party Cloudflare blog (source 21) says "completely free to everyone for unlimited use" but also references a 1M siteverify limit for advanced features. The two statements are not fully reconciled on the page |
| "5 distinct reporters" is unenforceable with anonymous credentials | **High** | Follows directly from constraint 7 (public repo) and section 11 |
| Reserved concurrency requires 100 unreserved units to remain, and is free | **High** | Primary AWS doc, explicit sentences, source 4b |
| Whether *this* account can set reserved concurrency today | **UNVERIFIED. Blocking open item.** | Requires a console check of the applied `Concurrent executions` quota. Account is 3 days old and AWS reduces quotas on new accounts. See 5.0 |
| The displayed scorecard (09 §13.3) has no numeric display gate | **High** | Read directly from `09` §13.3's schema and surrounding text. §13.2 gives guidance, §13.4 gives gates for the correction, neither is stated as a display gate for the scorecard |
| Whether a Lambda-emitted 429 incurs metered egress | **UNVERIFIED. Open item.** | Not stated on any page found. See 15.3 |
