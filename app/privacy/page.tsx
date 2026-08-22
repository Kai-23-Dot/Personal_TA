import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  Database,
  ExternalLink,
  GraduationCap,
  KeyRound,
  LockKeyhole,
  Scale,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { SmartlearnBackdrop } from "@/frontend/components/layout/SmartlearnBackdrop";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";
import { SmartlearnFooter } from "@/frontend/components/layout/SmartlearnFooter";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Smartlearn collects, uses, shares, retains, and protects account, learning, and connected-service data.",
};

const summaryCards = [
  {
    icon: GraduationCap,
    title: "Learning data stays purposeful",
    body: "Course content, grades, notes, and activity are used to provide study tools—not behavioral advertising.",
  },
  {
    icon: ShieldCheck,
    title: "No sale of personal data",
    body: "Smartlearn does not sell personal information or student course content and does not act as a data broker.",
  },
  {
    icon: KeyRound,
    title: "You control connections",
    body: "You choose which supported learning services to connect and can disable a connection from Settings.",
  },
] as const;

const serviceLinks = [
  { label: "Supabase", href: "https://supabase.com/privacy", use: "authentication, database, and file storage" },
  { label: "Vercel", href: "https://vercel.com/legal/privacy-notice", use: "application hosting and operational delivery" },
  { label: "OpenAI", href: "https://developers.openai.com/api/docs/guides/your-data", use: "AI generation, embeddings, image understanding, and transcription" },
  { label: "Stripe", href: "https://stripe.com/privacy", use: "subscription checkout, billing, and payment processing" },
  { label: "Resend", href: "https://resend.com/legal/privacy-policy", use: "transactional account and billing email" },
  { label: "Cloudflare", href: "https://www.cloudflare.com/privacypolicy/", use: "Turnstile anti-abuse verification when enabled" },
] as const;

export default function PrivacyPage() {
  return (
    <SmartlearnBackdrop>
      <SmartlearnHeader showSignIn />
      <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-36 sm:px-8 lg:pt-40">
        <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-[rgba(8,13,27,0.8)] shadow-[0_30px_100px_rgba(0,0,0,0.36)] backdrop-blur-xl">
          <header className="border-b border-white/8 p-6 sm:p-10 lg:p-14">
            <p className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/[0.07] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-sky-200">
              <LockKeyhole className="h-3.5 w-3.5" /> Privacy at Smartlearn
            </p>
            <h1 className="mt-6 max-w-3xl font-sora text-4xl font-semibold tracking-[-0.045em] text-white sm:text-6xl">
              Your learning data deserves clear rules.
            </h1>
            <p className="mt-4 text-sm text-slate-400">Effective August 22, 2026 · Last updated August 22, 2026</p>
            <p className="mt-6 max-w-3xl text-base leading-7 text-slate-300">
              This Privacy Policy explains what Smartlearn collects, why it is needed, who may process it, and the choices available to students, parents, educators, and other users.
            </p>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {summaryCards.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-400/[0.08] text-sky-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="mt-4 text-sm font-semibold text-white">{title}</h2>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{body}</p>
                </div>
              ))}
            </div>
          </header>

          <div className="p-6 sm:p-10 lg:p-14">
            <nav aria-label="Privacy policy contents" className="mb-10 flex flex-wrap gap-2">
              {[
                ["collection", "What we collect"],
                ["use", "How we use it"],
                ["sharing", "Who processes it"],
                ["choices", "Your choices"],
                ["students", "Students & parents"],
                ["contact", "Contact"],
              ].map(([href, label]) => (
                <a key={href} href={`#${href}`} className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:border-sky-300/25 hover:bg-sky-300/[0.06] hover:text-white">
                  {label}
                </a>
              ))}
            </nav>

            <div className="space-y-5">
              <PolicySection id="scope" number="01" title="Scope and roles" icon={Scale}>
                <p>This policy applies to Smartlearn&apos;s website, account dashboard, AI learning features, file tools, study groups, billing, and supported learning-management-system connections.</p>
                <p>When you create and use an individual Smartlearn account, Smartlearn determines how information is processed for the purposes described here. If a school or organization provides Smartlearn under a separate written agreement, that agreement may assign different privacy roles or provide additional protections and will control where it conflicts with this policy.</p>
                <p>Canvas, Google, Microsoft, Infinite Campus, and other third-party services remain independent from Smartlearn. Their own privacy notices and account controls apply when you use them.</p>
              </PolicySection>

              <PolicySection id="collection" number="02" title="Information we collect" icon={Database}>
                <div className="grid gap-3 md:grid-cols-2">
                  <DataCard title="Account and profile">
                    Email address, username or display name, profile image, school, grade level, role, subjects, time zone, preferences, and account timestamps. Password authentication is handled by Supabase; Smartlearn does not receive your plaintext password.
                  </DataCard>
                  <DataCard title="Connected learning services">
                    With your authorization, account identifiers, institution domain, access or refresh tokens, courses, teachers, assignments, deadlines, submissions, grades, feedback, modules, pages, files, and related synchronization metadata.
                  </DataCard>
                  <DataCard title="Content you provide">
                    Notes, documents, images, presentations, audio, extracted text, prompts, chats, flashcards, study plans, rubric material, answers, feedback requests, and support communications.
                  </DataCard>
                  <DataCard title="Learning and product activity">
                    Practice results, study and focus sessions, mastery indicators, schedules, feature usage, AI-token and storage usage, connection status, and onboarding progress.
                  </DataCard>
                  <DataCard title="Billing information">
                    Plan, subscription status, renewal dates, Stripe customer and subscription identifiers, and transaction status. Stripe collects payment-card and billing details directly; Smartlearn does not store full card numbers.
                  </DataCard>
                  <DataCard title="Device and security information">
                    Authentication cookies, OAuth security state, IP address, browser or device details, request timestamps, diagnostic logs, and abuse-prevention signals that Smartlearn or its infrastructure providers receive when operating and securing the service.
                  </DataCard>
                </div>
                <p>Information comes from you, your activity, services you choose to connect, people who share content with you in a study group, and the providers that operate Smartlearn&apos;s infrastructure.</p>
              </PolicySection>

              <PolicySection id="use" number="03" title="How we use information" icon={GraduationCap}>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {[
                    "Create, authenticate, maintain, and secure your account.",
                    "Sync and organize authorized courses, assignments, grades, and learning materials.",
                    "Generate explanations, summaries, practice material, study plans, and other requested AI features.",
                    "Personalize recommendations using deadlines, course context, practice history, and learning preferences.",
                    "Store notes, study progress, group activity, and settings across sessions and devices.",
                    "Process subscriptions, enforce plan limits, send service messages, and provide support.",
                    "Detect fraud, misuse, security threats, and violations of applicable rules.",
                    "Debug, maintain, measure, and improve reliability using aggregated or de-identified information where practical.",
                    "Comply with law, enforce agreements, and protect users, Smartlearn, and third parties.",
                  ].map((item) => (
                    <li key={item} className="flex gap-2 rounded-xl border border-white/7 bg-black/10 p-3 text-sm leading-6 text-slate-300">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p>Smartlearn does not use education records or uploaded course content for targeted advertising. We may create aggregate statistics that do not reasonably identify an individual, such as total feature usage or system performance.</p>
              </PolicySection>

              <PolicySection id="ai" number="04" title="AI processing" icon={Bot}>
                <p>When you request an AI feature, Smartlearn may send the prompt and the minimum relevant course context, notes, files, images, or audio to OpenAI so the request can be completed. Smartlearn also stores certain prompts, chat messages, generated material, embeddings, and usage totals in your account when needed to provide history, retrieval, and learning features.</p>
                <p>According to OpenAI&apos;s current API documentation, API inputs and outputs are not used to train OpenAI models by default unless the API customer explicitly opts in. OpenAI may retain abuse-monitoring logs containing prompts, responses, or related metadata for up to 30 days by default, subject to its policies, legal requirements, and available data-control settings.</p>
                <p>Do not submit information that is unnecessary for learning, such as government identifiers, financial credentials, medical records, or another person&apos;s confidential information. AI output may be inaccurate and is not an official academic decision or grade.</p>
                <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-300 underline decoration-sky-300/30 underline-offset-4 hover:text-sky-200">
                  OpenAI API data controls <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </PolicySection>

              <PolicySection id="sharing" number="05" title="When information is disclosed" icon={UsersRound}>
                <p>Smartlearn does not sell or rent personal information, does not share student course content for third-party advertising, and does not act as a data broker. Information may be disclosed only in these circumstances:</p>
                <ul className="space-y-2">
                  <Bullet><strong className="text-white">Service providers.</strong> Vendors process information under their terms and agreements to host Smartlearn, authenticate users, run AI features, process payments, deliver transactional email, and prevent abuse.</Bullet>
                  <Bullet><strong className="text-white">Connected services.</strong> Smartlearn exchanges data with an LMS or account provider at your direction and within the permissions authorized for the connection.</Bullet>
                  <Bullet><strong className="text-white">People you choose.</strong> Content, messages, display information, or progress you intentionally share in a study group may be visible to that group&apos;s members.</Bullet>
                  <Bullet><strong className="text-white">Legal and safety reasons.</strong> Information may be preserved or disclosed when reasonably necessary to comply with law or valid legal process, investigate abuse or fraud, enforce agreements, or protect rights and safety.</Bullet>
                  <Bullet><strong className="text-white">Business changes.</strong> Information may transfer in a financing, merger, acquisition, reorganization, or sale, subject to appropriate confidentiality and this policy or notice of materially different practices.</Bullet>
                  <Bullet><strong className="text-white">With permission.</strong> Smartlearn may disclose information for another purpose when you direct or consent to it.</Bullet>
                </ul>

                <div className="mt-5 overflow-hidden rounded-2xl border border-white/8">
                  {serviceLinks.map((service) => (
                    <div key={service.label} className="flex flex-col gap-1 border-b border-white/7 bg-white/[0.02] px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <a href={service.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-300 hover:text-sky-200">
                        {service.label} <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-xs leading-5 text-slate-400 sm:text-right">{service.use}</span>
                    </div>
                  ))}
                </div>
              </PolicySection>

              <PolicySection id="cookies" number="06" title="Cookies and local device storage" icon={LockKeyhole}>
                <p>Smartlearn uses necessary cookies for authentication, session continuity, and secure OAuth connections. When enabled, Cloudflare Turnstile may process technical information to distinguish legitimate signups or logins from automated abuse.</p>
                <p>Smartlearn also uses browser local storage for device-local features such as unfinished practice answers, saved study-guide views, interface state, and the timestamp used to coordinate automatic LMS synchronization across open tabs. This information remains on that browser until the feature clears it or you clear site data.</p>
                <p>Smartlearn does not currently use third-party advertising cookies. Blocking essential cookies may prevent sign-in or connected-service features from working.</p>
              </PolicySection>

              <PolicySection id="retention" number="07" title="Retention and deletion" icon={Database}>
                <p>Smartlearn generally keeps account data and user content while your account is active and for as long as needed to provide the requested features. Retention may vary by record: course and study history may remain for continuity; active connection credentials remain available for synchronization; billing, security, and transaction records may be retained longer when required for accounting, fraud prevention, disputes, or law.</p>
                <p>Disabling an LMS connection stops Smartlearn from treating it as active. You should also revoke the connection or token with the original provider. You may delete supported content through product controls where available or request account-data deletion. After a valid deletion request, Smartlearn will delete or de-identify covered information unless retention is legally required or needed for security or dispute resolution. Limited copies may remain temporarily in provider backups and logs under their retention schedules.</p>
              </PolicySection>

              <PolicySection id="security" number="08" title="Security" icon={ShieldCheck}>
                <p>Smartlearn uses safeguards designed to protect data, including HTTPS transport, authenticated access, server-only provider credentials, authorization checks, account-scoped database policies, restricted administrative access, input validation, and token-handling controls. Access tokens should be treated like passwords and revoked immediately if exposed.</p>
                <p>No internet service can guarantee absolute security. If you believe your account, token, or data has been compromised, revoke affected third-party access, change relevant passwords, and contact Smartlearn promptly.</p>
              </PolicySection>

              <PolicySection id="choices" number="09" title="Your privacy choices and rights" icon={Scale}>
                <p>Depending on where you live, you may have rights to access, correct, delete, or receive a copy of personal information; object to or restrict certain processing; withdraw consent; or appeal a denied request. Smartlearn will not discriminate against you for exercising applicable privacy rights.</p>
                <ul className="space-y-2">
                  <Bullet>Update available profile fields and preferences from Settings.</Bullet>
                  <Bullet>Disconnect supported LMS accounts from Settings and revoke access with the original provider.</Bullet>
                  <Bullet>Remove supported notes, group content, or other records using available product controls.</Bullet>
                  <Bullet>Manage subscription and payment information through Stripe&apos;s hosted billing portal.</Bullet>
                  <Bullet>Request access, correction, export, or deletion through the <Link href="/contact" className="font-semibold text-sky-300 underline decoration-sky-300/30 underline-offset-4 hover:text-sky-200">Contact page</Link>. Smartlearn may verify your identity before acting.</Bullet>
                </ul>
                <p>Because Smartlearn does not sell personal information or share it for cross-context behavioral advertising, there is no sale or targeted-advertising opt-out currently required for those practices. If that changes, this policy and the required controls will be updated first.</p>
              </PolicySection>

              <PolicySection id="students" number="10" title="Students, parents, and schools" icon={GraduationCap}>
                <p>Smartlearn is not intended for children under 13 and does not knowingly collect their personal information through individual accounts. A child under 13 must not create an account. If Smartlearn learns that information was collected from a child under 13 without legally valid authorization, it will take steps to delete it. Users below the age of legal majority should have a parent or guardian review Smartlearn&apos;s Terms and this policy.</p>
                <p>Education privacy requirements depend on how a service is provided. An individual student connecting an account does not by itself make Smartlearn a school official under FERPA. If a school authorizes Smartlearn and provides education records under a separate agreement, Smartlearn will process those records for the contracted educational purpose and follow the controlling agreement and applicable law. Parents and eligible students should direct FERPA record requests to their school unless instructed otherwise.</p>
              </PolicySection>

              <PolicySection id="international" number="11" title="International processing" icon={Database}>
                <p>Smartlearn and its providers may process information in the United States and other countries where they operate. Those countries may have different privacy laws. Where required, Smartlearn will use appropriate transfer mechanisms and process information based on contractual necessity, legitimate interests, consent, or legal obligations, depending on the activity and jurisdiction.</p>
              </PolicySection>

              <PolicySection id="changes" number="12" title="Changes to this policy" icon={Scale}>
                <p>Smartlearn may update this policy as the service, providers, or law changes. The updated date will appear at the top. If a change materially affects how personal information is used or reduces a meaningful privacy protection, Smartlearn will provide additional notice through the service or account email when reasonably required.</p>
              </PolicySection>

              <PolicySection id="contact" number="13" title="Privacy questions and requests" icon={ShieldCheck}>
                <p>For questions, safety concerns, or privacy-rights requests, use the <Link href="/contact" className="font-semibold text-sky-300 underline decoration-sky-300/30 underline-offset-4 hover:text-sky-200">Smartlearn Contact page</Link>. Include the email associated with your account and describe the request. Do not include passwords, API tokens, payment-card numbers, or unnecessary sensitive information.</p>
                <p>If your account is managed by a school or organization, you may also contact that institution. Smartlearn may need to coordinate with it when the institution controls the relevant education record.</p>
              </PolicySection>
            </div>

            <div className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5 text-sm leading-6 text-amber-100/90">
              Privacy and education laws vary by location and relationship. Nothing in this policy limits privacy rights that cannot legally be waived.
            </div>
          </div>
        </article>
      </main>
      <SmartlearnFooter />
    </SmartlearnBackdrop>
  );
}

function PolicySection({
  children,
  icon: Icon,
  id,
  number,
  title,
}: {
  children: React.ReactNode;
  icon: typeof ShieldCheck;
  id: string;
  number: string;
  title: string;
}) {
  return (
    <section id={id} className="scroll-mt-28 rounded-2xl border border-white/8 bg-white/[0.022] p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-400/[0.07] text-sky-200">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sky-300/70">Section {number}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</h2>
        </div>
      </div>
      <div className="mt-5 space-y-3 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  );
}

function DataCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="rounded-xl border border-white/7 bg-black/10 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-xs leading-6 text-slate-400">{children}</p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm leading-7 text-slate-300">
      <span aria-hidden="true" className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
      <span>{children}</span>
    </li>
  );
}
