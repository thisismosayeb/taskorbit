# TaskOrbit — Viva Guide (বাংলা)

> **সতর্কতা — আগে পড়ো:** এই গাইডের প্রতিটি তথ্য আসল কোড (`~/workspace/taskorbit`), `docs/DECISIONS.md` ও `docs/BUILD_LOG.md`-এর আসল টেস্ট রেজাল্ট থেকে নেওয়া। যা প্রমাণিত নয়, তা প্রমাণিত বলে লেখা হয়নি। Viva-তে এমন কিছু দাবি কোরো না যা এখানে "হয়নি / পরীক্ষা করা হয়নি" বলে লেখা আছে — শিক্ষক একটু খুঁচিয়ে ধরলেই ধরা পড়বে।

## সত্য-তালিকা (যা viva-তে বলা যাবে, আর যা যাবে না)

| বিষয় | আসল অবস্থা |
|---|---|
| Staging URL | https://taskorbit-gamma.vercel.app — লাইভ, 200 দেয় |
| Production | **নেই।** Production Supabase project-ই তৈরি হয়নি; Vercel-এ `taskorbit-production` প্রজেক্ট শুধু তৈরি করা হয়েছে, কোনো deploy হয়নি। তাই "production-এ আছে" বলা যাবে না |
| Gemini API key | **দেওয়া হয়নি।** AI-এর no-key পথ বানানো হয়েছে; key থাকলে AI কেমন চলে তা **পরীক্ষা করা হয়নি** |
| Migration 0007 (AI: `ai_summaries`, `ai_usage`, `daily_job_runs`) | লেখা হয়েছে, **apply করা হয়নি** |
| Migration 0008 (avatar bucket) | লেখা হয়েছে, **apply করা হয়নি**; avatar E2E (09) green হয়নি |
| Bell live-update | **জানা খোলা bug।** Staging-এ 2026-11-12 প্রমাণিত: channel live হয়, DB-তে notification row তৈরি হয় (54 → 60), কিন্তু bell ~১৫০ সেকেন্ডেও নড়ে না। মালিকের সিদ্ধান্তে Part 4-এর follow-up-এ রাখা হয়েছে |
| Demo data (seed) | Script লেখা হয়েছে (`scripts/seed-demo.ts`), কিন্তু **কোনো আসল database-এ চালানো হয়নি** — service-role key ছিল না। Staging-এ "Software Engineering Lab" workspace আছে বলে দাবি কোরো না, যতক্ষণ না নিজে seed চালিয়ে দেখেছ |
| Backup ভিডিও `docs/demo/taskorbit-demo.webm` | **Repo-তে এই ফাইল নেই।** Viva-র আগে staging-এ রেকর্ড করতে হবে; production-এ রেকর্ড করা অসম্ভব, কারণ production নেই |
| RLS test script (T01–T32) | লেখা আছে, **চালানো হয়নি** (Docker/psql ছিল না) |
| `supabase gen types` | **চালানো হয়নি**; `types/database.ts` হাতে লেখা (migration থেকে কপি করা) |
| Unit test | **251/251 PASS** (22 ফাইল) |
| Security test | **22 passed \| 4 skipped** |
| Playwright E2E (local dev) | **22/25** — ৩টি fail-এর ২টি ছিল আসল bug (theme re-login, login-এ Bangla হারানো) — দুটোই fix করা হয়েছে; ১টি ছিল tunnel সমস্যা |
| Lighthouse (mobile, local dev server, staging নয়) | `/`: Performance 57, Accessibility 96, Best Practices 100, SEO 92; `/dashboard`: 54 / 96 / 96 / 66 |

---

## ১. ৩০ সেকেন্ডের Introduction

> "আসসালামু আলাইকুম। আমাদের প্রজেক্ট **TaskOrbit** — একটি team task-management web app। Manager workspace বানিয়ে developer-দের invite করেন, project আর task assign করেন; developer subtask ভেঙে কাজ করেন, comment করেন, deadline দেখেন। Stack: Next.js আর TypeScript frontend, Supabase — Postgres, Auth আর Row Level Security — backend হিসেবে, আর Vercel-এ deploy। সবচেয়ে গুরুত্বপূর্ণ সিদ্ধান্ত: permission শুধু UI-তে নয়, database-এ trigger আর RLS policy দিয়ে আটকানো — developer চাইলেও অন্যের task edit করতে পারে না। ধন্যবাদ।"

## ২. ২ মিনিটের Introduction

> "আসসালামু আলাইকুম। আমরা Mosayeb Siam, Nabil Zaman আর Mamshad — আমাদের প্রজেক্ট **TaskOrbit**, ট্যাগলাইন 'Plan. Assign. Track. Deliver.' — ছোট team-এর জন্য একটি task-management web app।
>
> সমস্যাটা হলো, ছোট team-এ কাজ ছড়িয়ে থাকে — কে কী করছে, কোনটা দেরি হচ্ছে, তা এক জায়গায় দেখা যায় না। TaskOrbit-এ manager workspace বানান, developer-দের invite করেন, project আর task তৈরি করে assign করেন। Developer নিজের task-কে subtask-এ ভাঙতে পারেন, status বদলাতে পারেন, comment করতে পারেন। প্রতিটি task-এর deadline-এর অবস্থা রঙ আর লেখা দুটো দিয়েই দেখানো হয় — যেমন 'Overdue by 2 days', 'Completed on time' — আর cutoff হলো due date-এর দিন রাত ১১:৫৯:৫৯, workspace-এর timezone-এ, ডিফল্ট Asia/Dhaka।
>
> টেকনোলজি: Next.js 15 আর TypeScript, Supabase — Postgres database, Auth আর Row Level Security — আর deploy Vercel-এ। আমাদের সবচেয়ে বড় design সিদ্ধান্ত হলো security database-এ রাখা: developer শুধু নিজের assigned task-এর status বদলাতে পারে — এটা UI লুকিয়ে রাখে না, RLS policy আর trigger ডাটাবেসেই আটকায়। আরেকটা নিয়ম — parent task complete করা যায় না যতক্ষণ সব subtask শেষ না হয়; এটাও trigger দিয়ে আটকানো, শুধু frontend validation নয়।
>
> Part 3-এ আমরা landing page, dark/light mode, পুরো বাংলা অনুবাদ, GSAP animation, আর Gemini AI — যেমন daily brief আর deadline risk — যোগ করেছি। তবে সৎভাবে বলতে হয়: Gemini key আমাদের দেওয়া হয়নি, তাই AI-এর no-key অবস্থাটা দেখানো যায়; আর notification bell-এর live update-এ একটি জানা bug আছে, যা আমরা viva-তে লুকাব না — কারণটাও আমরা বলতে পারব। মোট ২৫১টি unit test পাস করে, আর staging-এ লাইভ দেখানো যায়। ধন্যবাদ।"

---

## ৩. Demo-র ক্রম (Screen-by-screen — এই order-ই অনুসরণ করো)

প্রতিটি ধাপে কী দেখাবে আর কী বলবে, তা সংক্ষেপে দেওয়া আছে। Route গুলো আসল — ভুল route বললে 404 খাবে।

| # | Screen | Route | কী দেখাবে (৩০–৬০ সেকেন্ড) |
|---|---|---|---|
| 1 | Landing page | `/` | হেডলাইন "Turn Big Ideas Into Brilliantly Managed Projects", GSAP scroll animation, feature section, Login/Signup বাটন। বলো: এটা public page, login ছাড়া এটুকুই দেখা যায় |
| 2 | Signup | `/signup` | Manager হিসেবে signup — মনে রাখবে: signup form-এ role বেছে নেওয়া যায় না; role শুধুমাত্র workspace-এ join করার সময় ঠিক হয়। Email confirmation OFF থাকলে সরাসরি `/onboarding`-এ যায় |
| 3 | Onboarding / workspace তৈরি | `/onboarding` | Workspace বানানো — যে বানায় সে-ই manager হয় (`create_workspace` RPC)। Timezone ডিফল্ট Asia/Dhaka |
| 4 | Dashboard | `/dashboard` | KPI card, deadline radar, team workload, recent activity। KPI-র Completed/Overdue লিংক এখন `/dashboard/tasks`-এ যায় |
| 5 | Team — invite | `/dashboard/team` | Developer-এর email দিয়ে invite; বলো: email যায় না — link copy করে দিতে হয়, token-এর শুধু SHA-256 hash ডাটাবেসে থাকে, মেয়াদ ৭ দিন |
| 6 | Developer join | `/invite/[token]` | দ্বিতীয় browser/profile-এ invite link খোলো, invited email দিয়েই signup — role chip-এ "Developer" দেখাবে |
| 7 | Manager — project তৈরি | `/dashboard/projects/new` | Project তৈরি (নাম, status, priority, তারিখ)। Developer এখানে গেলে "Page not found" পায় — এটা দেখানো যায় |
| 8 | Project detail + task assign | `/dashboard/projects/[projectId]` | Task তৈরি করে developer-কে assign করো; progress "0 of 1" দেখাবে |
| 9 | Developer — task + subtask | `/dashboard/tasks/[taskId]` | Developer ৩টি subtask বানায় → "0 of 3 done, 0%"। ২টি শেষ করলে "2 of 3 done, 67%"। তারপর parent complete করতে গেলে আটকাবে: "Complete all subtasks first (2 of 3 done)." — **এটাই সবচেয়ে ভালো demo মুহূর্ত, trigger-এর প্রমাণ** |
| 10 | Comment | একই task page | Developer comment লেখে ("Homepage design is ready for review") — manager-এর খোলা page-এ ~১০ সেকেন্ডে reload ছাড়া আসে (staging-এ 9.77 সেকেন্ডে পাস করেছে) |
| 11 | Deadline রঙ | `/dashboard/tasks` বা task page | ৫টি অবস্থা দেখাও: সবুজ Completed on time, লাল Overdue, হলুদ Completed late, নীল/neutral Due in X days, ধূসর No deadline। শুধু রঙ নয় — লেখাও থাকে |
| 12 | Board | `/dashboard/board` | Kanban drag-and-drop (dnd-kit)। নিজের task টেনে সরানো যায়; unassigned task locked — "Only the assignee can move this task."; subtask বাকি থাকলে Completed-এ টানলে rollback হয় |
| 13 | Calendar | `/dashboard/calendar` | Month/week/list view; due date অনুযায়ী task বসে; আজকের task-এ "Today" লেখা |
| 14 | Analytics (manager-only) | `/dashboard/analytics` | ৬টি chart: status donut, deadline health, workload, completed per week, priority, project progress। Developer এখানে গেলে "Analytics is for managers" পায় — এটাও দেখাতে পারো |
| 15 | AI | `/dashboard/ai` | সৎ demo: "TaskOrbit AI is not configured yet" — key নেই বলে। বলো: role gate আগে চলে — developer manager-only feature চাইলে "Only the workspace manager can use this AI feature." পায় |
| 16 | Activity | `/dashboard/activity` | ১০৯টি entry-র মতো audit log — কে কখন কী করল (task.created, comment.added, invite.created…) |
| 17 | Mobile / Dark / Bangla | যেকোনো page | মোবাইল ৩৭৫px-এ board/calendar/search চলে (staging-এ পাস); theme switcher Light → Dark → System; ভাষা EN → বাংলা — ১০৬০/১০৬০ key মিলে আছে |
| 18 | Settings — profile picture | `/dashboard/settings` | Avatar upload আছে, কিন্তু **সাবধান**: migration 0008 apply করা হয়নি বলে staging-এ upload কাজ করবে না — এটা না দেখিয়ে শুধু বলে দাও, "কোড তৈরি, migration বাকি" |

**Demo-র সময় bell-এর কথা:** bell-এ ক্লিক করে notification list দেখানো যাবে (list কাজ করে, mark-read staging-এ পাস করেছে), কিন্তু **live bell-update demo কোরো না** — ওটা জানা bug; নতুন notification এলে bell নিজে থেকে বাড়ে না, reload দিতে হয়। শিক্ষক জিজ্ঞেস করলে §৫-এর কঠিন প্রশ্ন ১ দেখো।

---

## ৪. Viva প্রশ্নোত্তর — সাধারণ (৫০টি)

উত্তরগুলো ইচ্ছে করে ছোট রাখা হয়েছে। এক লাইনে মূল কথাটা বলো, তারপর ফাইল/নামটা যোগ করো — শিক্ষক বুঝবেন তুমি সত্যিই কোডটা জানো।

### SDLC ও Requirement

**১. কোন SDLC model ব্যবহার করেছ?**
Iterative/incremental — Part 1 (database + auth), Part 2 (team workflows), Part 3 (design + i18n + AI), Part 4 (production + docs)। প্রতিটি part-এর শেষে টেস্ট আর build log লেখা হয়েছে।

**২. Requirement কীভাবে সংগ্রহ করেছিলে?**
Lab-এর লিখিত spec থেকে — Part 1–4-এর চারটি spec ডকুমেন্টই requirement-এর উৎস। প্রতিটি requirement-কে feature-এ ভেঙে `docs/DECISIONS.md`-এ লিখে রাখা হয়েছে।

**৩. Functional requirement-এর ৩টি উদাহরণ দাও।**
(১) Manager developer-কে invite করবেন; (২) developer নিজের task-এর status বদলাতে পারবেন; (৩) parent task সব subtask শেষ না হলে complete হবে না।

**৪. Non-functional requirement-এর ৩টি উদাহরণ দাও।**
Security (RLS + trigger), performance (server-side aggregation), usability (Bangla + dark mode + mobile responsive)।

**৫. Requirement change হলে কী করবে?**
`DECISIONS.md`-এ decision লিখে, migration-এ বদল এনে, unit আর E2E টেস্ট আপডেট করে — কারণ database-এর নিয়ম বদলালে UI আর টেস্ট দুটোই বদলাতে হয়।

### Use Case, Actor, ERD

**৬. Actor কারা?**
দুজন: Manager আর Developer। দুটোই একই Supabase Auth user; role থাকে `workspace_members.role`-এ (`workspace_role` enum: `manager`, `developer`)।

**৭. Manager-এর use case গুলো কী?**
Workspace বানানো, project/task তৈরি-সম্পাদনা-মুছে ফেলা, task assign করা, developer invite/revoke করা, যেকোনো comment মুছে ফেলা, analytics দেখা।

**৮. Developer-এর use case গুলো কী?**
নিজের assigned task-এর status বদলানো, নিজের task-এর নিচে subtask বানানো/সম্পাদনা করা, যেকোনো task-এ comment করা, নিজের comment সম্পাদনা/মুছে ফেলা।

**৯. Use case diagram-এ include/extend-এর উদাহরণ দাও।**
"Task complete করা" include করে "সব subtask শেষ আছে কি না যাচাই করা" — যাচাই ছাড়া complete হয় না। "Invite accept করা" extend করে "ভুল email হলে error দেখানো"।

**১০. ERD-তে মূল entity গুলো কী কী?**
`profiles`, `workspaces`, `workspace_members`, `workspace_invitations`, `projects`, `tasks`, `comments`, `activity_logs`, `notifications` — মোট ৯টি টেবিল (`0001_init.sql`)।

**১১. `tasks` আর `projects`-এর সম্পর্ক কী?**
Many-to-one: অনেক task একটি project-এর। `tasks.project_id` → `projects.id` (foreign key)।

**১২. Subtask কীভাবে মডেল করা?**
Self-referencing foreign key: `tasks.parent_task_id` → `tasks.id`। এক level-ই — subtask-এর নিচে আর subtask হয় না (`validate_task()` trigger আটকায়)।

**১৩. Primary Key কী? এখানে কোনটি?**
যে column দিয়ে row-কে uniquely চেনা যায়। প্রায় সব টেবিলে `id uuid primary key default gen_random_uuid()`।

**১৪. Foreign Key কী? উদাহরণ দাও।**
এক টেবিলের column যা আরেক টেবিলের PK-কে নির্দেশ করে। যেমন `tasks.assigned_to` → `profiles.id`; `comments.task_id` → `tasks.id`।

**১৫. JOIN বলতে কী? তোমাদের কোথায় লাগে?**
দুই টেবিলের সম্পর্কিত row একসাথে আনা। যেমন task list আনতে `tasks`-এর সাথে `profiles` JOIN করে assignee-র নাম নেওয়া হয়; `activity_logs`-এর সাথে `profiles` JOIN করে actor-এর নাম দেখানো হয়।

**১৬. One-to-many আর many-to-many-র উদাহরণ দাও।**
One-to-many: এক workspace-এ অনেক project। Many-to-many: user আর workspace — একজন user একাধিক workspace-এর member হতে পারে, তাই মাঝখানে `workspace_members` join টেবিল আছে।

### Database, RLS, Trigger

**১৭. RLS (Row Level Security) কী?**
Postgres-এর নিয়ম: `SELECT/INSERT/UPDATE/DELETE`-এর সময় প্রতিটি row-এর ওপর policy চলে। Policy না মিললে row-ই ফেরত আসে না — এমনকি সঠিক UUID জানলেও না।

**১৮. RLS না থাকলে তোমাদের app-এ কী হতো?**
যেকোনো logged-in user অন্য workspace-এর task-এর UUID জানলেই তা পড়তে বা বদলাতে পারত। UI লুকিয়ে রাখলেও API দিয়ে ঢোকা যেত। (বিস্তারিত কঠিন প্রশ্ন ২-এ)

**১৯. তোমাদের একটি RLS policy-র নাম ও কাজ বলো।**
`tasks_update`: developer শুধু নিজের assigned task update করতে পারে (`is_task_assignee(id, auth.uid())`), manager যেকোনো task পারে।

**২০. `is_workspace_member` আর `member_role` কী?**
`0001_init.sql`-এর helper function: প্রথমটি বলে user workspace-এর member কি না, দ্বিতীয়টি তার role ফেরত দেয়। প্রায় সব policy এদের ওপর দাঁড়িয়ে।

**২১. Trigger কী? উদাহরণ দাও।**
Database-এ INSERT/UPDATE/DELETE হলে নিজে থেকে চলা function। যেমন `trg_tasks_block_completion` → `block_parent_completion()`: subtask বাকি থাকলে parent complete করতে গেলে error ছোড়ে।

**২২. Trigger আর application-level validation-এর পার্থক্য কী?**
Application validation শুধু আমাদের app দিয়ে ঢুকলে কাজ করে; trigger database-এ থাকে, তাই REST API বা অন্য client দিয়ে ঢুকলেও একই নিয়ম চলে।

**২৩. Parent complete হলে `completed_at` কে সেট করে?**
ক্লায়েন্ট নয় — trigger `trg_tasks_completed_at` → `maintain_completed_at()` status `completed` হলে `now()` বসায়, reopen হলে NULL করে দেয়।

**২৪. Subtask reopen হলে parent-এর কী হয়?**
`trg_tasks_reopen_parent` parent-কে আবার `in_progress` করে দেয় আর `completed_at` মুছে ফেলে — `activity_logs`-এ লেখা থাকে।

**২৫. Invite token কীভাবে নিরাপদে রাখো?**
আসল token কখনো store করা হয় না — শুধু তার SHA-256 hash (`token_hash`) থাকে। Link-এর token মিলিয়ে hash করে যাচাই করা হয়; মেয়াদ ৭ দিন, একবার ব্যবহার হলে আর চলে না (`accept_invitation` RPC)।

### Auth, Session, SSR, REST

**২৬. Authentication আর Authorization-এর পার্থক্য কী?**
Authentication = তুমি কে (login, Supabase Auth)। Authorization = তুমি কী করতে পারো (manager নাকি developer, কোন workspace-এর member) — আমাদের ক্ষেত্রে RLS আর `lib/permissions.ts` দিয়ে।

**২৭. Signup form-এ role বেছে নেওয়া যায় না কেন?**
কারণ form-এর role বিশ্বাস করা হতো না — যেকেউ নিজেকে manager বানিয়ে ফেলতে পারত। Role ঠিক হয় শুধু workspace তৈরির সময় (creator = manager) বা invite accept করার সময়।

**২৮. Session কীভাবে ধরে রাখো?**
Supabase Auth + `@supabase/ssr` প্যাটার্ন: `middleware.ts` প্রতিটি request-এ session refresh করে, cookie-তে রাখে। Server `supabase.auth.getUser()` দিয়ে user যাচাই করে — client-পাঠানো ID বা role কখনো বিশ্বাস করা হয় না।

**২৯. Cookie-তে কী থাকে?**
শুধু session token আর preference (যেমন `taskorbit-workspace-id`, `taskorbit-locale`, `taskorbit-theme`)। `taskorbit-workspace-id` শুধু পছন্দ — membership প্রতিটি request-এ সার্ভারে আবার যাচাই হয়।

**৩০. SSR (Server-Side Rendering) কী? এখানে কেন?**
পেজের HTML সার্ভারেই বানানো হয় (Next.js App Router)। এতে প্রথম load-এ content দেখা যায়, আর auth/role যাচাই সার্ভারে হয় — client-এ পৌঁছানোর আগেই ভুল user আটকে যায়।

**৩১. REST API আর Route Handler কী? তোমাদের কোথায়?**
HTTP endpoint যা JSON দেয়। আমাদের একটাই: `/api/cron/daily` (`app/api/cron/daily/route.ts`) — Vercel Cron প্রতিদিন ০২:০০ UTC-তে ডাকে, due-soon/overdue reminder আর daily brief বানায়।

**৩২. Cron route-কে বাইরের লোক ডাকলে কী হয়?**
`CRON_SECRET` ছাড়া বা ভুল secret দিলে 401। যাচাই হয় `timingSafeEqual` দিয়ে, যাতে timing attack-এ secret ফাঁস না হয়।

**৩৩. Server Action কী?**
Next.js-এ client component থেকে সার্ভারে চলা function — যেমন task তৈরি করা (`lib/actions/tasks.ts`)। এগুলোতে role যাচাই সার্ভারে হয়, client-এ নয়।

**৩৪. `getUser()` আর `getSession()`-এর পার্থক্য কেন গুরুত্বপূর্ণ?**
`getSession()` শুধু cookie-র token পড়ে (জাল করা যেতে পারে); `getUser()` Supabase-এ যাচাই করে। আমরা সবসময় `getUser()` ব্যবহার করি।

**৩৫. Password কীভাবে রাখা হয়?**
আমরা নিজে রাখি না — Supabase Auth hash করে রাখে। আমাদের কোডে বা database-এ কোথাও plain password নেই।

### Realtime, GSAP, AI, Deployment

**৩৬. Supabase Realtime কীভাবে কাজ করে?**
Postgres-এর logical replication: `tasks`, `comments`, `notifications` টেবিল `supabase_realtime` publication-এ আছে (`0005_realtime_analytics.sql`), `REPLICA IDENTITY FULL` সেট করা — INSERT/UPDATE/DELETE হলে websocket-এ event আসে, browser `router.refresh()` করে।

**৩৭. Live না হলে কী হয়?**
১০ সেকেন্ডে channel SUBSCRIBED না হলে, বা error হলে, hook ৩০ সেকেন্ডে একবার `router.refresh()` করে polling করে আর window focus-এও refresh করে। UI-তে ভয়ের কিছু দেখানো হয় না, শুধু console-এ `live|polling` লেখা হয়।

**৩৮. GSAP কী? কোথায় ব্যবহার?**
JavaScript animation লাইব্রেরি। Landing page-এ ScrollTrigger দিয়ে scroll করলে section ভেসে ওঠে। `prefers-reduced-motion` থাকলে animation প্রায় বন্ধ (০.০১ ms) — accessibility-র জন্য।

**৩৯. Liquid Progress কী?**
Progress বার-এ তরল-ঢেউয়ের মতো অ্যানিমেশন (`components/motion/liquid-progress.tsx`)। হিসাব কিন্তু এতে নয় — হিসাব `lib/progress.ts`-এ: project progress = completed top-level task ÷ মোট top-level task।

**৪০. AI feature গুলো কী কী?**
৬টি: `daily_brief`, `project_summary` (শুধু manager), `my_focus`, `deadline_risk`, `standup`, `next_actions` (`lib/ai/features.ts`)। মডেল ডিফল্ট `gemini-2.5-flash`।

**৪১. Gemini API key কীভাবে নিরাপদ?**
Key শুধু সার্ভার env var (`GEMINI_API_KEY`)-এ থাকে, কখনো client bundle-এ যায় না। Security test-এ ৬৩টি client JS ফাইল scan করে কোনো key পাওয়া যায়নি। Key না থাকলে সৎভাবে বলে: "TaskOrbit AI is not configured yet"।

**৪২. AI-এর rate limit কীভাবে ঠেকাও?**
Workspace দৈনিক আর user-প্রতি ঘণ্টার limit (`lib/ai/limits.ts`), আর একই input-এর SHA-256 digest মিললে ৭ দিনের cache থেকে ফেরত (`AI_CACHE_TTL_DAYS = 7`) — অযথা API call নয়। Durable counter থাকে `ai_usage` টেবিলে (migration 0007 — এখনো apply হয়নি, তাই আপাতত in-memory fallback চলে)।

**৪৩. Vercel-এ deploy কীভাবে হয়?**
GitHub repo `thisismosayeb/taskorbit` Vercel-এর সাথে যুক্ত; push করলে staging deploy হয়। প্রজেক্ট `taskorbit1/taskorbit`, ফাংশন region `iad1` (us-east-1)।

**৪৪. Environment variable কী?**
কোডে নয়, deploy platform-এ রাখা সেটিং — যেমন `NEXT_PUBLIC_SUPABASE_URL`, `CRON_SECRET`। Secret কখনো commit করা হয় না; production-এর `CRON_SECRET` আলাদা, মান কেউ ফেরত পড়তে পারে না।

**৪৫. Cron মানে কী?**
সময়মতো নিজে চলা কাজ — এখানে `vercel.json`-এ `0 2 * * *`, মানে প্রতিদিন ০২:০০ UTC-তে `/api/cron/daily` ডাকা হয়।

### Testing ও Limitation

**৪৬. কী কী test করেছ?**
Unit test (Vitest): **251/251 পাস** — deadline, progress, permission, AI limit, i18n ইত্যাদি। Security test: **22 পাস, 4 স্কিপ**। Browser E2E (Playwright): স্থানীয়ভাবে **22/25**, staging-এ bell FAIL, comment PASS, mark-read PASS।

**৪৭. একজন developer অন্যের task পড়তে পারে কি না — কীভাবে প্রমাণ করেছিলে?**
Security test case (a–s): অন্য workspace-এর row 0টি ফেরে, manager ছাড়া update 42501 (insufficient_privilege) error পায়। Search-এও cross-workspace কিছু মেলে না ("No matches in this workspace.")।

**৪৮. Deadline-এর ৫টি অবস্থা কীভাবে test করেছিলে?**
`tests/unit/deadline.test.ts` (১৫টি test) আর হাতে-কলমে browser-এ: গতকালের due task-এ লাল "Overdue by 12 hours", সেটা complete করলে হলুদ "Completed late (12 hours)"।

**৪৯. তোমাদের প্রজেক্টের ৩টি সীমাবদ্ধতা বলো।**
(১) Bell-এর live update staging-এ চলে না (জানা bug); (২) AI key নেই, তাই AI-with-key পরীক্ষা করা হয়নি, আর migration 0007 না থাকায় AI cache/usage/cron-reminder আসলে চলে না; (৩) RLS-এর T01–T32 SQL script কখনো চালানো হয়নি — live E2E দিয়ে যাচাই হয়েছে, প্রতিটি policy আলাদা করে নয়।

**৫০. Lighthouse score কেমন? Performance ৫৭ কেন?**
Mobile-এ `/`: Performance 57, Accessibility 96, Best Practices 100, SEO 92 (স্থানীয় dev server-এর মাপ, staging-এর নয়)। কম performance-এর কারণ ঠিকমতো নির্ণয় করা হয়নি — সম্ভাব্য কারণ বড় JS bundle আর dev server; production build-এ আবার মাপতে হবে বলে সৎভাবে স্বীকার করো।

---

## ৫. কঠিন / চালাকি প্রশ্ন (১০টি) — সৎ, বিনয়ী উত্তর

এগুলোই viva-তে নম্বর ঠিক করে দেয়। মুখস্থ কোরো না — বুঝে বলো। ভুল ঢাকতে গিয়ে মিথ্যা বলার চেয়ে "জানি না, তবে এভাবে খুঁজে বের করব" বলা ভালো।

**ক১. "AI দিয়ে বানিয়েছ, তোমরা কী শিখলে?"**
"স্যার, AI আমাদের টুল ছিল, সিদ্ধান্ত আমাদের। AI কোড লিখে দিলেও কোন নিয়ম database-এ থাকবে আর কোনটা UI-তে — এটা আমরাই ঠিক করেছি, `DECISIONS.md`-এ লিখেছি। আসল শেখাটা হয়েছে bug ধরতে গিয়ে — যেমন bell live bug-টা: AI-এর লেখা কোড চোখে সঠিক মনে হচ্ছিল, কিন্তু staging-এ দুইবার ১৫০ সেকেন্ড দেখে প্রমাণ হলো subscription ঠিক, callback-ই ডাক পাচ্ছে না। RLS, trigger, Realtime, SSR, টেস্ট লেখা — এগুলো না বুঝলে টেস্টের ফলও বোঝা যেত না। তাই AI দিয়ে বানালেও আমরা প্রতিটি অংশ বুঝে, টেস্ট করে, ভুল স্বীকার করে নিয়েছি।"

**ক২. "RLS না থাকলে কী হতো?"**
"তাহলে শুধু UI-ই সব আটকাত। Developer URL-এ অন্যের task-এর ID বসিয়ে, বা সরাসরি Supabase REST API ডেকে, যেকোনো task পড়তে-বদলাতে পারত — UI তাকে থামাতে পারত না, কারণ UI-কে বাইপাস করা যায়। RLS থাকায় database নিজেই বলে 'এই row তোমার নয়', তাই আমাদের security test-এ cross-workspace query 0 row ফেরত দেয় আর update-এ 42501 error হয়। এটা আমাদের architecture-এর সবচেয়ে সচেতন সিদ্ধান্ত।"

**ক৩. "Free plan-এ কত user চালাতে পারবে?"**
"স্যার, নির্দিষ্ট কোনো সংখ্যা দাবি করব না — Supabase free tier-এ user-count-এর hard cap নয়, resource-এর cap থাকে: database size, storage, bandwidth, আর auth-এর monthly active user সীমা। আমাদের lab/demo scale — কয়েক ডজন user, কয়েকশো task — এতে চলবে। কিন্তু সত্যিকারের production scale হলে paid plan লাগবে, আর free project ৭ দিন নিষ্ক্রিয় থাকলে pause হয়ে যায় — viva-র আগের দিন তাই আমরা project active আছে কি না যাচাই করব।"

**ক৪. "Bell live চলে না — এত বড় project-এ এটা কি ব্যর্থতা নয়?"**
"এটা আমাদের জানা দুর্বলতা, স্যার, আর আমরা তা লুকাচ্ছি না। প্রমাণ আছে: staging-এ channel live হয় ৫ সেকেন্ডে, DB-তে notification row তৈরি হয় (৫৪ → ৬০), comment live ৯.৭৭ সেকেন্ডে আসে — তার মানে Realtime transport ঠিক আছে। শুধু notifications channel-এর callback-এ payload পৌঁছাচ্ছে না — probable কারণ `recipient_id` filter বা publication/RLS মিলছে না, অথবা channel session load হওয়ার আগে anonymously join করছে। Track A-র ধারণা অনুযায়ী `ensureRealtimeAuth` দিয়ে subscribe-এর আগেই JWT pin করলে এটা যাবে — কোড গাছে আছে, কিন্তু এখনো যাচাই হয়নি, তাই পাস বলে দাবি করছি না। এই bug-ই আমাদের শিখিয়েছে: browser-এ কাজ দেখালেই হয় না, DB, network আর client — তিনটি স্তরে আলাদা করে প্রমাণ দরকার।"

**ক৫. "তাহলে live দেখা না গেলে comment কী করে live আসে?"**
"কারণ comment আর notification আলাদা channel, আলাদা filter। Comment channel একটাই task-কে ফিল্টার করে (`task_id = ...`), আর notification channel প্রতিটি user-এর নিজের notification (`recipient_id = auth.uid()`) ফিল্টার করে। Realtime-এর কাজ একই, কিন্তু filter বা auth context-এর ছোট পার্থক্যে একটা চলে আর একটা চলে না — সেটাই এই bug-কে খুঁজতে কঠিন করেছে। এছাড়া ৩০ সেকেন্ডের polling fallback আছে বলে কোনো update চিরদিন আটকে থাকে না — ৩০ সেকেন্ডের মধ্যে refresh-এ এসে যায়।"

**ক৬. "Polling fallback মানে তোমাদের Realtime আসলে ভুয়া?"**
"না স্যার, fallback মানেই ব্যর্থতা নয় — graceful degradation। আসল পরিবেশে Realtime সবসময় connect নাও হতে পারে (আমাদের নিজের VM-এই proxy-এর জন্য websocket block হতো)। তাই ডিজাইন হলো: channel ১০ সেকেন্ডে না উঠলে ৩০ সেকেন্ড পরপর নিজে refresh করবে — ব্যবহারকারী এতে একটু দেরিতে হলেও সঠিক data পায়, আর app কখনো মিথ্যা 'live' দেখায় না। Mode-টা `data-realtime-mode` attribute-এ থাকে, console-এ `live|polling` লেখা হয় — যাতে টেস্টের সময় বোঝা যায় কোন পথে এসেছে।"

**ক৭. "Test database Singapore-এ, Vercel us-east-1-এ — এতে কী ক্ষতি?"**
"ক্ষতি হলো latency, স্যার। Test Supabase project `ap-southeast-1` (Singapore)-এ, আর Vercel function `iad1` (us-east-1, Virginia)-এ — দুই প্রান্তের মধ্যে প্রতিটি query-কে অর্ধেক পৃথিবী ঘুরে যেতে হয়। Dashboard-এর ক্লিক ৪–৫ সেকেন্ড লাগার রিপোর্ট এসেছে — এটা প্রমাণিত কারণ নয়, কিন্তু সম্ভাব্য বড় কারণ এটাই। সেজন্য production Supabase-এর জন্য `us-east-1` region সুপারিশ করা হয়েছে, Vercel-এর পাশে, যাতে round-trip কমে। সঠিক কারণ মাপতে হলে দুই region-এ একই query-র সময় মেপে তুলনা করতে হবে — সেটা এখনো করা হয়নি, তাই নিশ্চিত বলে দাবি করছি না।"

**ক৮. "Cold start কী? তোমাদের app-এ কোথায় লাগে?"**
"Serverless function অনেকক্ষণ না ডাকলে Vercel সেটা ঘুম পাড়িয়ে দেয়; পরের প্রথম request-এ function জেগে উঠতে কয়েক সেকেন্ড বেশি লাগে — এটাই cold start। আমাদের পেজগুলো dynamic (SSR), তাই প্রথম hit ধীর হতে পারে। viva-র আগের দিন আমরা staging একবার ঘুরে দেখে function-গুলো 'জাগিয়ে' রাখব, আর viva-র সময় প্রথম ক্লিকের ধীরগতি দেখে ঘাবড়ে যাব না।"

**ক৯. "তোমরা বলছ ২৫১টা test পাস — তাহলে bell bug ধরা পড়ল না কেন?"**
"কারণ unit test শুধু pure function ধরে — deadline-এর হিসাব, progress-এর ভাগ, permission helper। Bell-এর জায়গায় সমস্যা হলো browser + websocket + RLS-এর মিলিত আচরণ — এটা unit test ধরতে পারে না। Playwright E2E সেটা ধরেছিল — ২৫টার মধ্যে bell live বারবার fail হয়েই এসেছে (স্থানীয়ভাবে ২০.৭ সেকেন্ডে ৪৮ → ৪৯, polling mode-এ)। শেখাটা হলো: টেস্টের সংখ্যা নয়, কোন স্তরের টেস্ট মিলছে — এটাই মাপার বিষয়। আর সেই কারণেই `tests/rls/rls-tests.sql` চালানো হয়নি বলে আমরা কখনো দাবি করি না যে 'সব policy প্রমাণিত'।"

**ক১০. "Avatar upload দেখাতে পারবে?"**
"এখন দেখাতে পারব না, স্যার — আর সেটা সৎভাবে বলছি। কোড পুরো তৈরি (`components/settings/avatar-upload-form.tsx`, `lib/actions/avatar.ts`, ১৩টি unit test পাস), কিন্তু migration 0008 — যা `avatars` bucket বানায় — এখনো apply করা হয়নি। Bucket ছাড়া upload-এর জায়গাই নেই। Migration apply করার পর E2E (09-avatar) চালিয়ে সবুজ হলে তবেই demo করব। viva-তে না-চলাটা জোর করে দেখানোর চেয়ে 'কেন থেমে আছে' বলা ভালো — আমাদের dependency টা পরিষ্কার: migration → bucket → upload।"

---

## ৬. Mapping — কোড কীভাবে রিপোর্টের সাথে মেলে

| রিপোর্টের অংশ | কোড / ফাইল | প্রমাণ (টেস্ট / লাইভ) |
|---|---|---|
| Analysis & Design — Requirement, Use Case, Actor | `docs/DECISIONS.md` (role, permission টেবিল); Part 1–4 spec | Role দুটি (`manager`/`developer`), invite-only join |
| Analysis & Design — ERD, DB design | `supabase/migrations/0001_init.sql` (৯ টেবিল, ৪ enum, ৩৬ policy, ২৫ trigger), `0002_rpc.sql` (RPC), `0005_realtime_analytics.sql` | টেস্ট project-এ ৯ টেবিল, ৩৬ policy, RLS সব টেবিলে ON — যাচাইকৃত |
| Analysis & Design — SDLC, architecture | Next.js App Router + Supabase (`lib/supabase/server.ts`, `client.ts`, `middleware.ts`); server action (`lib/actions/*`) | Build ২৯ route, typecheck + lint clean |
| Implementation — Auth & workspace | `app/(auth)/*`, `app/onboarding`, `lib/auth/actions.ts`, `app/invite/[token]` | ১২ ধাপের E2E চেকলিস্ট পাস (Part 1); invite reuse-এ "already used" error |
| Implementation — Task, subtask, deadline | `lib/date/deadline.ts` (`getDeadlineState`), `lib/progress.ts`, `lib/permissions.ts` | Unit 251/251; live-এ parent-block toast + 5টি deadline chip |
| Implementation — Board, calendar, search, activity | `app/dashboard/board|calendar|activity`, `components/search/search-dialog.tsx`, `lib/actions/board.ts` | Playwright test ২–৮, ১২ পাস |
| Implementation — Notification, Realtime | `0004_notifications.sql` (trigger), `lib/realtime/*`, `components/notifications/*` | Comment live staging-এ 9.77s PASS; bell live FAIL (জানা bug) |
| Implementation — Analytics | `app/dashboard/analytics`, `lib/actions/analytics.ts`, `lib/analytics.ts` | Developer direct POST → `{"error":"Only the workspace manager can view analytics."}`; manager → পুরো data |
| Implementation — Design, Dark/Bangla, motion | `components/landing/*`, GSAP; `components/theme/*`; `lib/i18n/en.ts` + `bn.ts` (১০৬০/১০৬০) | Lighthouse A11y 96; theme re-login bug ধরা পড়ে fix হয়েছে |
| Implementation — AI | `lib/ai/*` (`features.ts`, `gemini.ts`, `limits.ts`, `cron-auth.ts`), `app/dashboard/ai`, `app/api/cron/daily/route.ts` | Key ছাড়া "not configured" PASS; role gate live-এ যাচাইকৃত; key-সহ NOT TESTED |
| Result — Testing | `tests/unit/*`, `tests/security/*`, `tests/e2e/*` (০১–০৯) | Unit 251/251; security 22 পাস \| 4 স্কিপ; E2E 22/25 (local); staging: comment/mark-read/task/ mobile PASS |
| Result — Deployment | `vercel.json` (cron `0 2 * * *`), Vercel project `taskorbit1/taskorbit` | Staging https://taskorbit-gamma.vercel.app 200; production **নেই** |
| Result — Limitations | (এই গাইডের উপরের সত্য-তালিকা) | Bell bug, 0007/0008 বাকি, RLS script না-চালানো, Lighthouse Perf 57 — সব লিখিত |
| Viva-Voce — প্রশ্নোত্তর | এই গাইডের §৪–§৫ | ফাইল/নামসহ ছোট উত্তর — নিজের কোডের নাম বলতে পারাই প্রমাণ |

---

## ৭. Viva-র আগের দিনের Checklist

সবগুলো করে ✓ দাও। একটাও না করে viva-তে যেও না।

- [ ] **Staging বেঁচে আছে কি না:** https://taskorbit-gamma.vercel.app খুলে `/`, `/login`, `/about` — তিনটাই 200 আসছে কি না দেখো। না খুললে Vercel dashboard-ে deployment status দেখো।
- [ ] **Supabase active কি না:** Supabase free project ৭ দিন নিষ্ক্রিয় থাকলে pause হয়ে যায় (৯০ দিন পর delete)। Dashboard-ে project "Active" দেখাচ্ছে কি না যাচাই করো; pause হলে Restore চাপো, তারপর আবার login করে দেখো।
- [ ] **Test account login:** Manager ও developer — দুই অ্যাকাউন্টেই login হয় কি না দেখো (test project-এর পরিচিত অ্যাকাউন্ট: `manager@testorbit.dev` / `developer@testorbit.dev` — password ডকুমেন্টে লেখা যাবে না, টিমের কাছে থাকা password ব্যবহার করো; staging যেই project-এ চলে, সেই account-ই যাচাই করে নাও)। Login-এর পর dashboard-এর KPI আর task list দেখাচ্ছে কি না।
- [ ] **Demo data reset:** যদি demo workspace-এ নিজেরা খেলতে গিয়ে ডেটা নোংরা করে ফেলো, `node scripts/reset-demo.ts` দিয়ে মুছে `node scripts/seed-demo.ts` দিয়ে আবার বানাও — তবে শুধুমাত্র তখনই, যখন `.env.demo.local` তৈরি করে staging/test project-এর বিরুদ্ধে চালাচ্ছ, কখনোই production-এর বিরুদ্ধে নয়। **মনে রেখো: seed এখনো কোনো আসল database-এ চালানো হয়নি** — প্রথমবার চালালে সময় নিয়ে যাচাই করো (Capstone 75%, "Implement the task board" 67%, ৫টি deadline state)।
- [ ] **Gemini quota / AI:** Key **নেই** — তাই "AI চালু" দেখানোর চেষ্টা কোরো না। `/dashboard/ai`-তে গিয়ে দেখো "TaskOrbit AI is not configured yet" লেখাটা আসছে কি না, আর developer অ্যাকাউন্টে manager-only feature চাইলে role-gate error আসছে কি না — **এটাই তোমাদের AI demo**। key থাকলে আলাদা কথা হতো; না থাকলে মিথ্যা demo বানিও না।
- [ ] **Backup ভিডিও:** `docs/demo/taskorbit-demo.webm` **repo-তে নেই — আগে রেকর্ড করতে হবে।** Staging-এ §৩-এর ক্রম ধরে স্ক্রিন রেকর্ড করো (landing → login → task assign → subtask block → comment → board → analytics → Bangla/dark)। ফাইলটা `docs/demo/taskorbit-demo.webm`-এ রাখো। সৎভাবে বলো: এটা staging-এর রেকর্ডিং, production-এর নয়, কারণ production এখনো নেই।
- [ ] **Internet না থাকলে:** (১) ব্যাকআপ ভিডিওটা laptop-এ offline চালিয়ে দেখাবে; (২) `docs/`-এর এই গাইড আর `DECISIONS.md` PDF/প্রিন্ট করে নেবে, যাতে architecture (ERD, RLS policy নাম, trigger নাম) বক্তব্য দিয়ে বোঝানো যায়; (৩) স্থানীয়ভাবে `npm run dev` চালিয়ে `http://localhost:3000`-এ demo দেওয়ার প্রস্তুতি রাখবে — তবে মনে রেখো, local dev-এর database connection staging/test project-এর সঙ্গে internet ছাড়া কাজ করবে না, তাই local demo-র দাবি আগেই যাচাই করে নাও, না হলে ভিডিও-ই ভরসা।
- [ ] **Bell নিয়ে প্রস্তুতি:** §৫-এর ক৪–ক৬ মুখস্থের মতো বুঝে নাও। Demo-তে bell-এর list দেখানো যাবে, live বাড়া দেখানোর চেষ্টা কোরো না।
- [ ] **Laptop প্রস্তুতি:** চার্জার, দ্বিতীয় browser profile (manager + developer একসাথে demo-র জন্য), ভিডিও ফাইল, আর এই গাইড — সব এক ফোল্ডারে। Vercel/Supabase dashboard-এ ঢোকার password নিজের কাছে রাখো, কারো সামনে টাইপ কোরো না।
- [ ] **শেষ কথা মনে রাখো:** না জানলে বলো "এটা আমরা পরীক্ষা করিনি, যেভাবে পরীক্ষা করব তা হলো…"। মিথ্যা দাবি এক সেকেন্ডের, কিন্তু শিক্ষক একটা মিথ্যা ধরলেই বাকি সব সত্যও সন্দেহের চোখে দেখবেন।

---

*এই গাইড লেখা হয়েছে 2026-11-13, `docs/DECISIONS.md` ও `docs/BUILD_LOG.md` (Part 3 §12, Step 0.2 staging ফলাফল, Part 4 Track D/E নোট) এবং আসল কোড (routes, migrations 0001–0008, `lib/ai/*`, `lib/realtime/*`) পড়ে। কোনো সংখ্যা, deployment বা টেস্ট দাবি করা হয়নি যা ওই দুই ডকুমেন্টে নেই। নতুন তথ্য পেলে এই ফাইলটাই আপডেট করো — মুখের কথায় নয়, ফাইলে।*
