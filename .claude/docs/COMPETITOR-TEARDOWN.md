> **This is a competitor teardown, not a plan for this repository.**
>
> It describes **guideflow.com**, a hosted demo-automation SaaS that captures a *clone* of an
> application so that *prospects who do not have the product* can drive a replica. **GuideFlow.js —
> this repository — is an MIT library embedded in a customer's real application, guiding that
> application's own signed-in users.** The two share a name and are different products in adjacent
> categories.
>
> **Read [`EXPANSION-PLAN.md`](./EXPANSION-PLAN.md) before acting on anything below.** It grades
> every capability here into shipped / adopt / reframe / different-product, and it is the plan.
> Implementing this document literally would mean building a SaaS with a backend, against ADR-014.
>
> **This capture is truncated.** It ends mid-sentence inside item 7 of §11's build order. Items 7+
> were never captured.
>
> Captured 2026-08-01 by the repository owner. Moved here from the repository root on 2026-08-07 so
> it persists in project context. Body unmodified.

---

# Guideflow — Full Product Teardown
_Reference document for building a comparable interactive demo / demo automation platform._
_Source: guideflow.com (homepage, /product/*, /features/*, /solution/*, /integrations, /pricing, /company/security-and-compliance). Captured 2026-08-01._

---

## 1. What the product is

Guideflow positions itself as a **demo automation platform**. Its central idea is captured by its own slogan, "show don't tell": instead of describing a software product through decks, screenshots, PDFs or recorded videos, a company captures its real web or mobile app and turns it into an **interactive, clickable replica** that a prospect, customer or employee can drive themselves in a browser — with no login, no trial, no sales call and no installation.

The unit of content is called a **guideflow**: a captured sequence of product screens, enriched with interactive overlays (tooltips, spotlights, calls-to-action, forms, voiceover), which can be personalized per viewer, published to a URL or embed, and measured.

The platform is not just a recorder. It is really four layers stacked together:

1. **A capture engine** that clones product UI (as screenshots, video, or live HTML/DOM).
2. **A no-code editor** that turns the raw capture into a guided or freely explorable experience.
3. **A distribution layer** (links, embeds, exports, custom domains, access control).
4. **A go-to-market data layer** (visitor identification, engagement analytics, lead capture, CRM sync, alerts).

That fourth layer is the real differentiator versus a simple screen-recording tool: Guideflow treats every demo as a lead-generation and intent-signal surface, not just a piece of content.

---

## 2. The problem it claims to solve

The site frames the "before / after" contrast repeatedly. Reconstructed:

**Without interactive demos**
- Buyers must book a call or wait for a trial to see the product at all.
- Marketing assets (screenshots, decks, PDFs, videos) go stale as the product changes.
- Producing demo material depends on design, dev or product teams, so cycles are long.
- Live demos break (the "demo effect"), and staging environments are expensive to maintain.
- No visibility into which features or messages actually resonate.
- Support teams repeat the same "how do I…" explanations on calls and tickets.
- Sensitive customer data in real environments makes sharing risky.

**With interactive demos**
- Buyers self-educate instantly and hit the "aha moment" without human involvement.
- Content is updated in place, without re-recording, and stays current.
- Anyone non-technical can build a demo, so demo creation scales across teams.
- Demos run in a safe, controlled clone — no backend risk, no live data exposure.
- Every click is measurable, so intent can be scored and routed to sales.
- Support and onboarding become self-serve, reducing ticket volume.

---

## 3. Product organisation (the six products)

Guideflow's catalogue is organised as a suite of six products that share one capture engine, one editor, one analytics layer and one integration layer. Understanding this separation matters if you are building something similar, because it is essentially a **fidelity ladder** — each product is a higher-fidelity, higher-cost way of representing the same product.

### 3.1 Interactive Demo
The base product and entry point. A guided, step-by-step, self-serve walkthrough of a web app. Captured from the browser or desktop, generated automatically into a flow, then annotated with tooltips, CTAs and callouts. Designed to replace "book a demo" on marketing pages with "try it now". Supports screenshot-based, HTML-based and video-based recording; branching so viewers can choose their own path; and full analytics.

### 3.2 Demo Page
A single hosted page that aggregates **multiple** demos, on the reasoning that a buying committee needs more than one demo. Layouts can be switched between grid, list, carousel, playlist or category folders. Content can be grouped by persona, vertical, product line or funnel stage, with conditional logic to show or hide demos depending on who is visiting. Fully brandable (logo, colours, own domain), gateable behind a form, embeddable, and instrumented with per-demo engagement tracking and visitor/company identification.

### 3.3 Demo Center
The most elaborate container — a branded, self-serve "demo hub" that mixes interactive demos, videos, PDFs, case studies, forms and CTAs into one guided buyer journey. Key concepts:
- **Curated playlists** grouped by product, persona or use case.
- **Self-qualification**: viewers answer single-choice, multiple-choice or matrix questions and are routed to relevant paths, which doubles as lead qualification.
- **Multi-stakeholder tracking**: identifies several individuals from the same account and profiles the buying committee.
- **Reusable resource library** shared across centres.
- **Drag-and-drop builder**, personalization via variables and CRM/MAP data, real-time analytics, intent-based Slack/email alerts.

Positioned explicitly against using a CMS, a video hub or a Notion page for this job.

### 3.4 Sandbox
A **clickable demo environment** rather than a linear walkthrough. Built from HTML-based capture, then made freely navigable: elements are auto-linked to other steps so a viewer can wander the product as they would the real thing. Simulates product behaviour without live data or a backend, so it cannot break or leak. Includes editable UI elements and inline editing, embedded plugins (calendar, video, chat), variables from CRM/email tools, AI-assisted editing of text/tables/charts, presenter mode with private notes for live calls, offline mode, and access controls. Used both as a self-serve environment for prospects and as a reliable stage for live sales demos.

### 3.5 Live Demo
The highest-fidelity tier: **automated product cloning** with an emulated backend. Guideflow replicates the product's UI *and* its backend logic through a proxy, connecting to real APIs, databases, mock datasets or uploaded CSVs, so interactions trigger genuine-feeling responses. Distinctive capabilities:
- **Per-session environment reset** — every visitor starts from a clean state with no leftover data or broken paths.
- **Dataset injection** — pre-built industry datasets or custom ones, loaded contextually per persona or account.
- **Demo library** of pre-built templates organised by use case, persona or industry.
- Presenter notes for live calls; works both live and async.

### 3.6 Mobile Demo
Mobile-first equivalent. Captures iOS, Android, hybrid, React Native or Flutter apps via device mirroring or a built-in simulator — no SDK, no code, no App Store upload. Records gestures, swipes and animations. A **frame library** renders the demo inside device chrome matched to real phone/tablet viewports, with dark/light mode support. Shared as a link, QR code, SMS or embed, so no install is needed. Includes branching, variables, localization, session heatmaps and replay.

---

## 4. How it works — the end-to-end pipeline

This is the operational core to replicate. Five stages:

### Stage 1 — Capture
The user installs a capture client and walks through their own product exactly as a user would, then presses Finish. A step-by-step flow is generated automatically.

**Capture clients:** Chrome extension, macOS desktop app, Windows desktop app, Figma plugin.

**Three capture modes, in ascending fidelity:**
| Mode | What it stores | Best for |
|---|---|---|
| Screenshot-based | Static images per step + click coordinates | Fastest builds, simple walkthroughs, mobile |
| Video-based | Recorded video segments | Motion-heavy flows, narration |
| HTML-based | The live DOM/HTML of each page | Editable, clickable, personalizable demos; required for Sandbox and Live Demo |

HTML-based capture is the strategic one: because the DOM is stored, every text node, image, chart and element remains individually addressable and therefore editable, blurrable, linkable and personalizable after the fact. If you build only screenshot capture, you cannot offer the personalization or sandbox tiers.

**Capture behaviours:** continuous recording across multiple browser tabs, windows, apps and screens; multi-screen support; desktop and mobile capture; automatic resizing and resolution normalisation; pre-defined resolutions; ability to insert, reorder or re-record individual steps later without redoing the whole capture; keyboard shortcuts; manual import of steps.

### Stage 2 — Edit
The raw capture is opened in a WYSIWYG plug-and-play builder (they advertise 150+ customization options). What can be layered on:

- **Guidance overlays:** hotspots, walkthrough tooltips, spotlights, custom popups, pan-and-zoom focus effects, autoplay, step transitions.
- **Navigation structure:** chapters, checklists with progress tracking and jump-to-step, multi-button popups for branching, internal links between steps and external URLs.
- **Conversion elements:** CTAs (multiple per demo), custom lead forms (text, email, phone, number fields), surveys, consent/terms capture, calendar booking widgets.
- **Media:** webcam recording, uploaded video, audio voiceover with studio optimisation, AI voiceover (40+ languages), AI avatars (150+ models), AI video clones of a real person, subtitles.
- **Embeds:** any iframe or third-party widget — video, forms, calendar, live chat — displayed fullscreen, inline or in a popup.
- **Privacy tooling:** blur, hide or delete any element; bulk-apply blurring across all steps; PII-oriented redaction for compliance.
- **Branding:** logo, brand colours, custom fonts, saved themes, customizable browser chrome, dark/light modes, watermark control, branded share page.
- **Reuse:** a steps/assets library so common steps and blocks are stored once and reused across demos, with automatic propagation of updates; templates; demo versioning.

### Stage 3 — Personalize
A no-code HTML editor operating on the captured DOM. This is where one recording becomes thousands of tailored variants.

- Edit text, numbers, images, videos, charts and graphs by selecting the element directly.
- **Dynamic variables** for text, images and numbers (e.g. `{{FIRST_NAME}}`), populated from URL parameters, CRM records or email tools — so a prospect sees their own company name, logo and industry inside the product UI.
- **Find and replace** across the whole demo, with bulk edits applied to multiple or all steps.
- **Auto-linking**: automatic detection of interactive elements and connection to target steps, chapters or external URLs — this is what converts a linear recording into a clickable sandbox.
- **Chart and dataset control**: adjust values, colours and styles; import datasets; upload CSVs; AI data editor.
- **Plugin and API connection**: JavaScript plugins, iframes, animations and API calls for genuinely dynamic behaviour.
- Element-level blur, hide, duplicate or remove.
- Stock image and brand logo libraries.

### Stage 4 — Share and distribute
Very broad distribution surface — worth copying almost wholesale, because reach is where the value compounds.

- **Public link**, with permission controls and adjustable privacy.
- **Embed widget (iframe)** for websites, landing pages, apps, help centres and product pages — always reflecting the latest version.
- **Personalized/branded share page** with logo, colours and multiple CTA buttons.
- **Custom links** with custom slugs, UTM parameters, per-audience variables and individual tracking.
- **Exports:** HD video (MP4), GIF, PDF — for offline, documentation or email use.
- **Email invitations** to named individuals or teams, with access management.
- **Offline mode** — download and run the demo with full interactivity and no internet, for tradeshows, events with poor Wi-Fi, and field sales.
- **Custom domain / white-label hosting** at domain or subdomain level, with HTTPS/SSL.
- **Access control:** password protection, link expiry dates, domain-restricted access, authentication tokens.
- **Channel-specific distribution:** review platforms (G2, TrustRadius, Capterra, Product Hunt listings), email marketing platforms (Marketo, Pardot, ActiveCampaign, Mailchimp), social and paid ads (LinkedIn, X, Facebook), Slack and Teams, knowledge bases and docs platforms, and sharing straight from Gmail or Outlook.

### Stage 5 — Analyze and act
Every demo is instrumented, and the output is pushed into GTM systems.

- **Aggregate analytics:** impressions, completion rate, drop-off points, conversion, step-by-step engagement, path analysis and navigation insights, engagement hotspots.
- **Session-level analytics:** individual sessions, time spent per step, clicks, browsing behaviour, key actions, heatmaps and session replay (mobile), funnel metrics.
- **Audience data:** geography, device and platform, demographic breakdown, returning-visitor tracking, custom filters and segmentation by role, source, location, device or engagement level.
- **Identification and enrichment:** AI-based visitor and account recognition down to company, persona and intent; enrichment with email, phone and company data (Clearbit-style); recognition of new prospects versus existing leads versus new stakeholders on a known account.
- **Lead capture:** form and survey responses stored, exportable, and usable to branch the experience.
- **Scoring and routing:** lead scoring based on demo interaction and intent; automatic assignment of high-intent leads to reps.
- **Alerting:** real-time notifications to Slack, Teams, email or webhooks when someone views a demo, completes a key flow, reaches a goal step or spends significant time.
- **Sync:** enriched lead and engagement data pushed to CRM (Salesforce, HubSpot, Pipedrive and others), analytics tools, and any endpoint via webhook or API.

### Stage 6 — Collaborate (cross-cutting)
Workspace mechanics that make it a team tool rather than a personal one:

- Public, private and shared folders with sub-levels; tags; workspace organisation; flexible models by team, use case or role.
- Role-based access: admin, editor, guest, viewer; flexible security rules; SSO, SAML and SCIM.
- Real-time collaborative editing with live presence indicators, teammate cursors, simultaneous editing across steps, and a smart element selector.
- Threaded comments on specific steps or demos, teammate tagging, status tracking and notifications.
- Change history and activity logs on HTML changes, with one-click restore of any version.
- Centralised theme and brand management, reusable across all demos, so branding updates propagate globally.
- Hotkeys for navigation, bulk actions, copy/paste/cut/delete/undo/redo.
- **Presenter Mode**: private per-step notes visible only to the presenter, for live calls, webinars, training and in-person meetings.

---

## 5. AI capabilities

AI is presented as a horizontal accelerator across the whole pipeline, not a separate product. Worth treating the same way in your own build.

- **AI demo generation** — generates the entire demo's content: step titles, descriptions, popup copy, transitions, and automatic pan-and-zoom, then refines the overall flow.
- **AI demo editor** — instantly edits, translates, anonymizes or personalizes any element in an HTML-based demo. Generates text, images and charts.
- **AI-generated CTAs** — context-aware, conversion-oriented callout copy per step, with tone selected by prompt or preset.
- **AI voiceover** — natural-sounding narration in 40+ languages, multiple tones and styles, auto-synced to steps. Plus AI subtitles.
- **AI avatars** — 150+ professional avatars to narrate a demo without appearing on camera.
- **AI video clone** — turn a real team member (e.g. the CEO) into a speaking avatar with lip and voice sync, reusable across the team.
- **AI translation and localization** — full-flow translation covering text, voice and UI, with support cited at 100+ languages.
- **AI chat co-pilot / assistant** — a conversational interface for editing: change text, colours, layouts, blur data, restyle, by typing a request in natural language. Described as an adaptive learning agent accepting custom prompts.
- **AI dataset generator** — populates the demo with realistic, industry- and persona-appropriate synthetic data, refreshable dynamically, with customizable fields.
- **AI visitor and account recognition** — identifies company, persona and intent behind a session and syncs it onward.

---

## 6. Use cases, by team

Guideflow segments its use cases by internal function. Each has its own claimed outcome metrics (their figures, quoted as their claims).

### 6.1 Product Marketing / Marketing
The flagship use case. Replace "book a demo" gates with instant hands-on experiences; drive qualified pipeline.
- Embed demos on the website, landing pages, blog posts and pricing pages.
- Interactive changelogs and feature-launch announcements, to drive adoption of new features and product stickiness.
- ABM email campaigns where variables inject the prospect's company name, industry and logo into the product UI — one demo becoming infinite account-specific versions.
- Tradeshows and events using offline mode.
- Review platforms (G2, TrustRadius, Capterra) so buyers can try the product at the moment of comparison.
- Social and community posts, and paid ads with lead capture inside the ad experience.
- Self-serve Demo Centers for buyers who want to explore before talking to anyone.
- Claimed: ~80% higher engagement when users interact versus watch; 3× faster time-to-value versus traditional video; 5× more product-qualified leads; +33% more qualified leads from demos embedded in marketing pages.

### 6.2 Sales
Keep deals moving between meetings and let prospects self-educate.
- Reliable, bug-free demos that don't depend on product or staging availability.
- Personalization per persona and industry via variables and branching.
- Demo Pages to centralise everything a given deal needs on one branded link.
- Follow-up assets sent at every stage to address specific objections.
- Visitor recognition to see which stakeholders are engaging and which features they care about, feeding CRM-triggered events.
- Claimed: 30% shorter sales cycle, 3× faster deal closing, 2× larger deal size.

### 6.3 Pre-Sales / Solutions Engineering
Remove the cost of maintaining bespoke demo environments.
- Build and edit demos in minutes instead of provisioning sandboxes.
- Templates per persona, use case and segment, customized at scale without code.
- Blur sensitive data easily.
- Eliminate the "demo effect" by presenting from a controlled clone.
- Presenter notes standardise delivery quality across the team.
- Claimed: +30% pre-sales capacity, 90% reduction in unqualified demos, 30% shorter sales cycles.

### 6.4 Customer Success / Support
Scale support without scaling headcount.
- Interactive step-by-step guides embedded directly in the help centre, knowledge base, academy or in-app — no redirect, users learn by doing.
- Answer support tickets by dropping a clickable walkthrough into the chat instead of typing instructions.
- Build a self-serve training academy covering every common question.
- Share guides in Slack or Teams customer channels, and watch which advanced features customers explore as an expansion signal, with automatic alerts.
- Async onboarding replaces scheduled live walkthroughs, freeing live time for at-risk and expansion accounts.
- Integrations cited: Zendesk, Intercom, GitBook, Mintlify.
- Claimed: up to 40% fewer inbound tickets, 3× faster onboarding, ~60% lower average handle time, ~2× accounts managed per CSM, +80% engagement.

### 6.5 Partnerships
Enable partners to sell your product without giving them access to it.
- Ready-to-use, standardised demo content so partner messaging stays accurate and on-brand while you retain control.
- Demo Centers and Demo Pages as a partner resource hub with search.
- Easy re-sharing by partners via link, embed or email.
- Duplicate-and-adapt workflows plus variables for per-partner customization at scale.
- Analytics on partner engagement, plus embedded forms for partner feedback and event-triggered automations.
- Claimed: +30% partner engagement, +50% referral revenue, 3× partner ROI.

### 6.6 Training & Enablement (internal)
- Interactive internal training content that is fast to create and easy to keep current.
- Embedded into internal tools; personalized with variables; branched by role or team.
- Feedback collected through in-demo popups and surveys; general plus session-level analytics to spot where employees struggle.
- Templates, branded pages and shared themes to keep material consistent and professional.
- Demo Center plus a searchable resource library as the single home for training content.
- Claimed: +60% training effectiveness, 4× employee engagement, +35% collaboration.

### 6.7 Product / Onboarding
- In-product onboarding walkthroughs and feature tours.
- Interactive release notes so users experience what shipped.
- Documentation engagement (their Scaleway story centres on this).

---

## 7. Integration catalogue

Grouped exactly as Guideflow groups them. The recurring integration *verbs* are: create/update lead records, sync engagement and session data, send form data, trigger actions on events, and embed demos inside the tool.

| Category | Tools |
|---|---|
| CRM | Salesforce, HubSpot, Pipedrive, Zoho CRM, Microsoft Dynamics 365, Close |
| Analytics | Segment, Mixpanel, Heap, Google Analytics, Amplitude |
| Automation | Webhooks, Zapier (5,000+ apps), Make, Resthooks |
| Marketing automation | Marketo, Pardot, Oracle Eloqua, Mailchimp, Klaviyo, ActiveCampaign, SendGrid |
| Sales engagement | Outreach, Salesloft, Gong, Apollo, Lemlist, Reply.io, Mailshake, Klenty, MixMax, Woodpecker, Amplemarket |
| Productivity | Notion, Airtable, Google Sheets, Excel, Trello |
| Communication | Slack, Microsoft Teams, Gmail, Outlook |
| Customer support | Zendesk, Intercom, Freshdesk, ServiceNow, Drift |
| Advertising / pixels | LinkedIn, Facebook, Twitter/X, TikTok, Snapchat, Quora, Google AdSense, Bing, AdRoll |
| Dev tools | JIRA, GitHub, Azure DevOps |
| HR / recruiting | Greenhouse, Lever |
| Project management | Monday, Linear, ClickUp, Asana |
| Knowledge base / docs | GitBook, Archbee, Mintlify |
| Calendars | Calendly, Chili Piper, Cal.com, HubSpot Meetings |
| Review platforms | G2, TrustRadius, Capterra, Product Hunt |
| Enrichment / privacy | Clearbit, OneTrust |
| Developer surface | REST API, webhooks, Analytics API, Workflow API, remote control, cross-frame events |

Two integration patterns are notable and easy to overlook: **advertising pixels embedded inside the demo itself** (so demo viewers become a retargetable audience), and **cross-frame events / remote control** (so a host page can drive or listen to an embedded demo programmatically).

---

## 8. Security and compliance posture

Relevant if you plan to sell to enterprises, since this is table stakes in this category.

- SOC 2 Type II certified (monitored via Vanta); GDPR and CCPA compliant.
- Regular third-party penetration tests and external code audits; secure development lifecycle.
- Encryption in transit and at rest; HTTPS/SSL; dedicated firewalls, switches and databases with no direct public access; prompt security patching and disabled risky web server features.
- Multiple hosting and data-residency options for privacy laws and internal policy.
- Granular permission levels, user groups, and SSO/OAuth/SAML/SCIM.
- Data Processing Agreement available; documented list of subprocessors.
- Documented incident response plan; 99.9% SLA.
- Product-level privacy features that matter here: PII blur/hide/delete, bulk redaction, password and domain-restricted access, link expiry, auth tokens, and the fundamental fact that demos are clones rather than live environments.

---

## 9. Packaging and feature gating

Guideflow's tier structure is instructive because it shows which capabilities carry the pricing power.

| Plan | Price (monthly) | Positioning | Gate |
|---|---|---|---|
| Free | $0 | Try it | 5 guideflows, screenshot + mobile demo, unlimited viewers, 7-day analytics, watermark, 1 seat |
| Solo | $35 | Individuals | Unlimited guideflows, advanced analytics, AI content, video/GIF export, AI translation, PII blur, lead forms & surveys, visitor identification. +$35/extra user |
| Growth | $499 | Startups | Adds **HTML-based demo & capture**, AI personalization, text/image/graph editing, demo library, advanced branching, Slack/Teams channel, dedicated CSM. 10 seats, +$50/extra |
| Advanced | $1,499 | Growing teams | Adds **Sandbox**, clickable environments, auto-linking, offline demos, presenter notes, custom domain, team training, Demo Center as add-on |
| Enterprise | from $2,999 | Scaling companies | Adds **Demo Center** included, **Live Demo** as add-on, AI dataset generator, professional services, demo creation service, dedicated expert and landline |

**The monetisation logic to copy:** screenshot demos are the free/cheap commodity. The paywall sits at **HTML-based capture**, because that unlocks editability, personalization and clickability. Sandbox, Demo Center and Live Demo are the enterprise ladder above it. Watermark removal, custom domains, offline mode, SSO and analytics retention are the classic secondary gates. Pricing is seat-based with per-seat overage.

---

## 10. Traction and proof points they lead with

Useful as the benchmark set your own marketing will be compared against. All are Guideflow's own claims.

- 500,000+ guideflows created; average 2 min 30 s to get a demo ready; +30% conversion rate.
- +84% completion rate for started interactive demos; 7× higher lead conversion for prospects who interact with a demo.
- 57% of buyers prefer to self-educate before talking to sales; 73% higher engagement than generic demo links or video; 10+ stakeholders and 8+ assets involved in a mid-market decision.
- Sandbox: 3× more qualified leads, 6× more demo interactions than a free trial, +35% meeting conversion.
- Live Demo: +61% faster sales follow-up, +83% time spent per session, 2.7× faster "aha moment".
- Mobile: +76% engagement versus static screenshots, 6× more conversion.
- Named customers referenced across the site: Amplitude, Gorgias, Scaleway, ChartMogul, PandaDoc, DocuSign, Captain Data, Oneflow, Forest Admin, Favikon, FullEnrich, Harfanglab, Stukent. Amplitude's referenced A/B test reported a 20%+ lift in account signups using the Demo Center.
- Supporting programmes: partner program, community, academy, playbook library, tutorials, demo showcase, changelog, status page, trust centre, press kit, 24/7 support.

---

## 11. Implications for building your own version

### Build order (highest leverage first)
1. **Screenshot capture + step generation + tooltip editor + public link + basic analytics.** This is the minimum viable loop and covers the free/Solo tiers.
2. **Chrome extension** as the primary capture client. Desktop apps and a Figma plugin later.
3. **HTML/DOM capture.** The single most important technical investment — everything premium depends on it. Store a sanitised, self-contained snapshot per step (inlined CSS, rewritten asset URLs, stripped scripts) so it renders offline and cannot call the origin backend.
4. **Element addressing and the no-code element editor** on top of the DOM snapshot: stable selectors per element, an overlay editor for text/image/chart/blur/hide/link, and bulk apply-across-steps.
5. **Auto-linking** to convert linear captures into clickable sandboxes.
6. **Variables and personalization tokens** resolved at view time from URL params, CRM lookup or a share-link payload.
7. **