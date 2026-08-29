# Smartlearn dashboard staging research

Research date: August 26, 2026
Color-system revision: August 28, 2026

## Goal and evaluation method

The dashboard is a daily decision surface for a student, not an admin analytics screen. Each reference was evaluated for:

1. Immediate next-action clarity
2. Information hierarchy with real, messy data
3. Dark-mode legibility and restrained use of color
4. Relevance to deadlines, courses, progress, and study behavior
5. Plausible desktop, tablet, and mobile adaptation

The review deliberately included both proven product interfaces and visual concepts. Product interfaces were weighted more heavily for interaction patterns; concepts were used mainly for atmosphere, layout, and visual treatment.

## Color-system revision

The first staging pass mixed near-black surfaces, low-contrast gray labels, violet decoration, cyan decoration, green status, orange urgency, and course colors. That made the interface feel less deliberate and caused small metadata to fall below a comfortable reading contrast. The revised system follows four established patterns:

- [Notion dashboards](https://www.notion.com/help/dashboards) prioritize an at-a-glance control center made from focused views and high-level entry points, so the Smartlearn canvas is quiet and its live information carries the hierarchy.
- [GitHub Primer color usage](https://www.primer.style/product/getting-started/foundations/color-usage/) separates functional background, border, text, accent, and semantic roles instead of styling each component independently.
- [Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) assigns different ranges of one scale to surfaces, interactive states, borders, solid fills, and text. The Smartlearn scale uses the same progression and pairs blue with a blue-tinted slate neutral.
- [W3C visual design guidance](https://www.w3.org/WAI/curricula/designer-modules/visual-design/) requires at least 4.5:1 contrast for normal text and 3:1 for meaningful UI graphics and component boundaries. Status is also communicated with labels or icons, not color alone.

### Authenticated workspace palette

| Role | Value | Use |
|---|---|---|
| Canvas | `#0B1020` | Page background |
| Sidebar | `#0E1527` | Persistent product navigation |
| Surface | `#11192A` | Cards, panels, menus |
| Raised surface | `#172238` | Hover and elevated controls |
| Border | `#2A3954` | Quiet grouping boundaries |
| Control border | `#586A88` | Inputs and controls requiring a 3:1 boundary |
| Primary text | `#F4F7FB` | Headings and primary values |
| Secondary text | `#C5CEDD` | Body copy and labels |
| Muted text | `#95A2B8` | Supporting copy |
| Tertiary text | `#7887A0` | Small metadata; still at least 4.5:1 |
| Brand/action | `#83B9FF` | Links, active navigation, focus, primary actions |
| Brand hover | `#A3CCFF` | Hovered action text or fill |
| Success | `#63D8AA` | Connected, complete, healthy |
| Warning | `#F6C177` | Urgent or attention required |
| Danger | `#FF8A9A` | Errors and destructive actions |

Measured against the primary `#11192A` surface, the primary, secondary, muted, tertiary, brand, success, warning, and danger text colors have contrast ratios of 16.34:1, 11.07:1, 6.80:1, 4.82:1, 8.65:1, 9.98:1, 10.71:1, and 7.82:1 respectively. The `#586A88` control border has 3.20:1 contrast against that surface.

Course colors remain user-data identifiers. Orange, green, and red are otherwise reserved for warning, success, and failure; violet and cyan are no longer decorative categories on the home dashboard.

## Examples reviewed (65)

### Proven product dashboards

The first 33 were compared through the [925 Studios dashboard review](https://www.925studios.co/blog/saas-dashboard-design-examples-2026) and the [AdminLTE product comparison](https://adminlte.io/blog/saas-dashboard-design-examples/).

| # | Reference | Strongest pattern | Smartlearn fit |
|---:|---|---|---|
| 1 | Stripe | One headline metric plus factual detail | High — strong hierarchy, but tables are secondary here |
| 2 | Vercel | Status-first, monochrome restraint | High — ideal for sync and deadline state |
| 3 | Baremetrics | One dominant value at 3× scale | Medium — useful hierarchy, wrong metric model |
| 4 | ChartMogul | Explains why the main number changed | Medium — useful for future grade trends |
| 5 | Linear | Quiet chrome and progressive disclosure | Very high — supports daily use without fatigue |
| 6 | Notion | Modular blocks and user-controlled depth | Medium — flexibility is useful, but a fixed priority view is better now |
| 7 | Intercom | AI summaries before drill-down | High — good model for recommendation reasons |
| 8 | Asana | Personal work first, organization second | Very high — directly maps to student deadlines |
| 9 | Height | AI-prioritized inbox | Very high — maps to Smartlearn's best-next-action logic |
| 10 | Amplitude | Modular analytical cards | Low — too analysis-heavy for the landing view |
| 11 | Mixpanel | Self-contained widgets | Medium — each card should explain itself |
| 12 | Datadog | Global status conventions | Medium — useful severity colors, excessive chart density |
| 13 | Grafana | Reusable parameterized layouts | Low — too configurable for a student home page |
| 14 | PostHog | Unified feed across several tools | High — useful for merging Canvas, practice, and focus signals |
| 15 | HubSpot | Full-width summary before detail | High — confirms the dominant action panel |
| 16 | Figma | Content recognition and persistent search | Medium — useful for later note/course previews |
| 17 | Loom | Metrics attached directly to content | Medium — useful for course cards |
| 18 | Retool | Active/changed items over decorative analytics | High — reinforces status-first design |
| 19 | Plausible | One-page restraint | High — avoids an overloaded dashboard |
| 20 | Clerk | Three-to-four meaningful KPIs | Very high — validates a compact pulse row |
| 21 | Mercury | Calm, trusted focal value | Very high — strong visual model for the primary action |
| 22 | Ramp | Outcomes rather than raw totals | Very high — translates signals into a recommended move |
| 23 | Brex | One anchor across multiple workflows | High — Smartlearn needs one home across many tools |
| 24 | Wise | Recognizable visual tokens | High — supports course-color signals |
| 25 | Causal | Actual versus target in one view | Medium — future readiness feature, not current landing content |
| 26 | Raycast | Dark-first, one accent, keyboard clarity | Very high — establishes restrained futuristic tone |
| 27 | Railway | Relationship map on a dark canvas | Medium — inspired the subtle course constellation |
| 28 | Sentry | Saturated color only for severity | Very high — orange is reserved for urgent work |
| 29 | Resend | Headline status plus clean log | High — maps to Canvas health plus recent work |
| 30 | Supabase | Dense tools with disciplined contrast | High — relevant to the existing sidebar and dark surfaces |
| 31 | Attio | AI output as a designed first-class component | Very high — informs the priority brief |
| 32 | Hex | Guided questions rather than a blank canvas | High — supports direct study-tool launch points |
| 33 | Cursor | Measures outcomes instead of interactions | High — keeps dashboard metrics factual and useful |

### Education and learning concepts

| # | Reference | Strongest pattern | Smartlearn fit |
|---:|---|---|---|
| 34 | [Phenomenon VR Education](https://dribbble.com/shots/20221682-VR-Education-platform-dashboard) | Immersive course hero with progress rail | Very high — best education-specific focal composition |
| 35 | [QClay Edtech](https://dribbble.com/shots/21673590-Edtech-Dashboard-UI) | Timetable, score, and assignment hierarchy | Very high — excellent scan order |
| 36 | [Online Education Dark](https://dribbble.com/shots/15907607-Online-Education-Dashboard-UI-Dark-Mode) | Upcoming learning plus compact progress | High — strong daily orientation |
| 37 | [Edu Platform](https://dribbble.com/shots/27072048-Edu-Platform-Dashboard-Design) | Structured dark educational analytics | Medium — useful density, primarily teacher-facing |
| 38 | [Educational Process Dashboard](https://www.behance.net/gallery/171062959/DASHBOARD-Organization-of-the-educational-process) | Calendar and personal progress balance | Medium — visually rich but too many simultaneous widgets |
| 39 | [Student Dashboard Dark](https://dribbble.com/shots/16063911-student-dashboard-ui-dark-theme) | Bright accents on a calm canvas | Medium — some metrics lack relevance to Smartlearn |
| 40 | [Academicia E-Learning](https://dribbble.com/shots/25573889-E-Learning-Dashboard) | Four factual progress cards | High — informs the pulse row |
| 41 | [Creatica E-Learning](https://dribbble.com/shots/22802385-E-Learning-Dashboard-dark-theme) | Course progress and weekly learning balance | High — useful course-card direction |
| 42 | [LMS Student Analytics](https://dribbble.com/shots/23095814-LMS-Student-Analytics-Dashboard) | Study-time comparison and recent course rail | High — good content grouping |
| 43 | [E-Learning Student Dashboard](https://dribbble.com/shots/25129825-E-Learning-Student-Dashboard-Design) | Upcoming classes and streak motivation | High — useful, but the original is too widget-heavy |
| 44 | [Learnova AI](https://dribbble.com/shots/27174422-Learnova-AI-Education-Analytics-Dashboard-UI) | Assignment table plus learning velocity | High — good clarity and spacing |
| 45 | [Mindrift](https://contra.com/p/L6XXLQsg-e-learning-platform-dashboard-design) | Calm hierarchy, heatmap, and streak context | Very high — strongest student analytics reference |
| 46 | [E-Learning Analytics](https://dribbble.com/shots/21364877-Analytics-Dashboard-for-eLearning-Platform) | Completion breakdown and submissions | Medium — instructor rather than student focus |
| 47 | [Ofspace LMS](https://dribbble.com/shots/19684212-LMS-Student-Analytics-Dashboard) | Time, score, assignments, and calendar | High — good content taxonomy |
| 48 | [AcademIQ](https://dribbble.com/shots/26542784-AcademIQ-Dashboard-E-Learning-Management-System) | Active courses plus daily schedule | High — directly informs course signals |
| 49 | [Fobework](https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/) | Luminous education cards on dark neutral surfaces | High — useful visual atmosphere |
| 50 | [VR Education Progress](https://www.designrush.com/agency/ui-ux-design/ua/kyiv) | Course completion and performance grouping | Medium — validates the Phenomenon composition |

### Cross-industry visual systems

| # | Reference | Strongest pattern | Smartlearn fit |
|---:|---|---|---|
| 51 | [AI Cybersecurity by Fireart](https://dribbble.com/shots/26642862-AI-powered-Cybersecurity-Dashboard) | AI insight plus system-health rail | Very high — informs workspace health treatment |
| 52 | [CyBer Monitoring](https://dribbble.com/shots/27103901-CyBer-Cybersecurity-Monitoring-Dashboard) | Urgency timeline and restrained neon status | High — informs deadline queue |
| 53 | [Cybersecurity UI](https://dribbble.com/shots/26756096-Cybersecurity-Dashboard-UI-Design) | Strong top-level status cards | Medium — visual energy is too high for long study sessions |
| 54 | [Security Monitoring](https://dribbble.com/shots/26782942-Cyber-Security-Monitoring-Dashboard) | Score, incident feed, and modular tools | Medium — useful structure, excessive density |
| 55 | [AI Productivity](https://dribbble.com/shots/26475284-AI-Productivity-Task-Management-Dashboard-UI) | Reports, task manager, and inbox in one frame | High — supports integrated learning workflows |
| 56 | [HALO Productivity](https://dribbble.com/halolab/services) | Deep work signals plus a calm daily timeline | Very high — excellent mood and daily focus pattern |
| 57 | [Work Planning](https://dribbble.com/shots/25338815-Work-Planning-Dashboard-Desktop-App-Concept) | Project progress and meeting schedule | High — good balance of action and context |
| 58 | [Modern Productivity](https://dribbble.com/shots/25678009-Modern-Productivity-Dashboard-UI) | Weekly activity with finality metrics | Medium — useful structure, dated typography |
| 59 | [Track Pulse](https://dribbble.com/shots/21277923-Track-Pulse-dashboard) | Time graph and task pool | Medium — kanban pattern does not fit the home view |
| 60 | [Fitness Tracking](https://dribbble.com/shots/27138367-Fitness-Tracking-Dashboard-UI-Health-Performance-Analytics) | Personalized modular signals | High — strong factual metric cards |
| 61 | [Fitpulse](https://dribbble.com/shots/27140057-Fitpulse-Fitness-Healthcare-Tracking-Dashboard-UI) | Glass cards plus upcoming sessions | High — relevant atmosphere and schedule treatment |
| 62 | [Smart Fitness](https://dribbble.com/shots/22779223-Smart-Fitness-Dashboard) | Goal rings and live device state | Medium — rings would imply unsupported progress data |
| 63 | [Airzon Analytics](https://dribbble.com/shots/27085837-Analytics-Dashboard-Dark-Mode-UI-SaaS) | High-contrast data hierarchy | Medium — too chart-heavy, good surface layering |
| 64 | [QuantumXEdge Analytics](https://www.quantumxedge.com/portfolio/saas-dashboard) | Compact system metrics with one accent | High — good factual pulse-card pattern |
| 65 | [Fintech Analytics](https://dribbble.com/shots/27088147-Fintech-Analytics-Dashboard) | Premium dark financial hierarchy | Medium — visual polish is useful, content model is not |

## Selected synthesis

The staging implementation primarily borrows:

- **Linear + Raycast:** quiet chrome, slightly lifted dark surfaces, and one dominant accent.
- **Vercel + Sentry:** status color has meaning; orange is urgent, green is healthy, blue is actionable.
- **Attio + Height + Ramp:** the dashboard recommends and explains one next action instead of presenting a wall of statistics.
- **Mercury:** the primary panel feels calm, trusted, and visually dominant without becoming oversized.
- **Phenomenon + QClay + Mindrift:** education-specific grouping for deadlines, active courses, focus, and streaks.
- **Fireart + HALO:** compact live-signal and workspace-health treatments create a futuristic feel without decorative noise.

## Intentionally rejected patterns

- No invented readiness percentages, fake charts, or sample activity.
- No neon applied to every component; color remains a state and course signal.
- No dense Grafana-style analytical wall on the student landing page.
- No oversized hero with unused vertical space.
- No fixed desktop-only bento grid: cards collapse at container-safe tablet and mobile breakpoints.
- No glass effects that reduce text contrast or obscure interactive boundaries.
