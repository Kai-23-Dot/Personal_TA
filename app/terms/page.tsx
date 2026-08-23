import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { SmartlearnBackdrop } from "@/frontend/components/layout/SmartlearnBackdrop";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";
import { SmartlearnFooter } from "@/frontend/components/layout/SmartlearnFooter";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing accounts, AI learning tools, subscriptions, and use of Smartlearn.",
};

const sections = [
  {
    title: "1. Acceptance and eligibility",
    body: (
      <>
        <p>These Terms of Service form an agreement between you and Smartlearn (&quot;Smartlearn,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By creating an account, purchasing a plan, or using the service, you agree to these Terms and our Privacy Policy.</p>
        <p>You must be at least 13 years old to use Smartlearn. If you are under the age of legal majority where you live, a parent or legal guardian must review and agree to these Terms for you. You may use Smartlearn for a school or organization only if you are authorized to accept these Terms on its behalf.</p>
      </>
    ),
  },
  {
    title: "2. The service and beta features",
    body: <p>Smartlearn provides learning assistance, practice tools, document processing, course prioritization, and connections to learning-management systems. Features identified as beta, preview, or experimental may be incomplete, change without notice, or be withdrawn. We do not promise that every feature will always be available or error-free.</p>,
  },
  {
    title: "3. Accounts and security",
    body: <p>You must provide accurate information, maintain the security of your login credentials, and promptly notify us of suspected unauthorized access. You are responsible for activity under your account. You may not share, sell, or transfer an individual account, bypass usage limits, or use another person&apos;s credentials.</p>,
  },
  {
    title: "4. AI output and academic integrity",
    body: (
      <>
        <p>AI-generated explanations, summaries, recommendations, answers, citations, and other output may be incomplete, inaccurate, or inappropriate. You must review output and verify important facts against course materials and qualified instructors. Smartlearn is a learning aid—not a teacher, grading authority, or substitute for legal, medical, financial, mental-health, or other professional advice.</p>
        <p>You remain responsible for your submitted schoolwork and for following your school&apos;s academic-integrity policies. You may not use Smartlearn to cheat, impersonate another student, evade proctoring, submit generated work as your own when prohibited, or make a consequential educational decision about another person.</p>
      </>
    ),
  },
  {
    title: "5. Your content and connected services",
    body: <p>You retain ownership of material you upload or connect, including assignments, notes, course files, prompts, and other content. You grant Smartlearn a limited, non-exclusive license to host, copy, process, transmit, and display that content only as reasonably necessary to operate, secure, support, and improve the service. You represent that you have the rights and permissions needed to provide the content. When you connect Canvas, Google, Microsoft, Stripe, or another third-party service, that provider&apos;s terms and privacy practices also apply. You may disconnect supported learning platforms through Settings.</p>,
  },
  {
    title: "6. Acceptable use",
    body: <p>You may not use Smartlearn to violate law or third-party rights; upload malware; harass, exploit, or endanger another person; generate unlawful or abusive content; probe or disrupt the service; scrape or reverse engineer protected portions of the service; resell access without written permission; evade safeguards or rate limits; or access data that you are not authorized to access. We may investigate suspected abuse and cooperate with lawful requests.</p>,
  },
  {
    title: "7. Subscriptions, renewal, and cancellation",
    body: (
      <>
        <p>Paid plans are billed in advance at the price, interval, currency, and renewal terms shown before checkout, plus applicable taxes. Unless canceled, a subscription automatically renews and the payment method on file is charged at the start of each billing period. Usage allowances and feature access vary by plan.</p>
        <p>You may cancel through the plan-management portal in Smartlearn. Cancellation stops future renewal and normally takes effect at the end of the current paid period. Except where required by law or expressly stated at purchase, fees already paid are non-refundable. We will give reasonable advance notice of a material price change before it applies to a renewal.</p>
      </>
    ),
  },
  {
    title: "8. Intellectual property",
    body: <p>Smartlearn and its software, design, branding, and original content are owned by Smartlearn or its licensors and are protected by intellectual-property laws. These Terms give you a limited, revocable, non-exclusive, non-transferable right to use the service for its intended purpose. They do not transfer ownership of Smartlearn intellectual property. Feedback may be used without restriction or compensation.</p>,
  },
  {
    title: "9. Privacy and data",
    body: <p>Our Privacy Policy describes how we collect, use, share, retain, and protect personal information. Do not upload highly sensitive information that is unnecessary for learning, including government identifiers, financial account credentials, health records, or another person&apos;s confidential data. School or institutional use may be subject to a separate agreement that controls if it conflicts with these Terms.</p>,
  },
  {
    title: "10. Suspension and termination",
    body: <p>You may stop using Smartlearn at any time. We may restrict or terminate access when reasonably necessary to address a Terms violation, fraud, security risk, legal requirement, nonpayment, harm to users or third parties, or discontinuation of the service. Where practical, we will provide notice and an opportunity to export user-provided content. Provisions that by their nature should survive termination will survive.</p>,
  },
  {
    title: "11. Disclaimers",
    body: <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, SMARTLEARN IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; WE DISCLAIM IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE, THIRD-PARTY CONNECTIONS, SYNCHRONIZED COURSE DATA, OR AI OUTPUT WILL BE ACCURATE, COMPLETE, SECURE, UNINTERRUPTED, OR SUITABLE FOR A PARTICULAR ASSIGNMENT OR RESULT. SOME JURISDICTIONS DO NOT ALLOW CERTAIN DISCLAIMERS, SO SOME OF THIS SECTION MAY NOT APPLY TO YOU.</p>,
  },
  {
    title: "12. Limitation of liability",
    body: <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, SMARTLEARN AND ITS AFFILIATES, CONTRIBUTORS, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, DATA, GOODWILL, OR OPPORTUNITIES. OUR TOTAL LIABILITY FOR CLAIMS RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID SMARTLEARN IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM OR (B) US$100. THESE LIMITS DO NOT APPLY WHERE LIABILITY CANNOT LAWFULLY BE LIMITED.</p>,
  },
  {
    title: "13. Indemnity",
    body: <p>To the extent permitted by law, you will defend and indemnify Smartlearn from third-party claims arising from your unlawful use of the service, your content, or your material violation of these Terms or another person&apos;s rights. This obligation does not apply to the extent a claim results from Smartlearn&apos;s own unlawful conduct.</p>,
  },
  {
    title: "14. Changes and general terms",
    body: <p>We may update these Terms to reflect changes to the service, law, or risk. If a change materially reduces your rights, we will provide reasonable notice through the service or account email before it takes effect. Continued use after the effective date means you accept the revised Terms. If any provision is unenforceable, it will be limited to the minimum extent necessary and the remaining provisions will continue. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them as part of a merger, financing, reorganization, or sale of the service.</p>,
  },
  {
    title: "15. Questions and notices",
    body: <p>Questions, support requests, and legal notices may be submitted through the <Link href="/contact" className="text-sky-300 underline decoration-sky-300/30 underline-offset-4 hover:text-sky-200">Smartlearn contact page</Link>. Please include the email associated with your account and enough detail for us to understand the request.</p>,
  },
] as const;

export default function TermsPage() {
  return (
    <SmartlearnBackdrop>
      <SmartlearnHeader showSignIn />
      <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-36 sm:px-8 lg:pt-40">
        <div className="rounded-[2rem] border border-white/10 bg-[rgba(8,13,27,0.78)] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-10 lg:p-14">
          <p className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/[0.07] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-sky-200">
            <Scale className="h-3.5 w-3.5" /> Legal
          </p>
          <h1 className="mt-6 max-w-3xl font-sora text-4xl font-semibold tracking-[-0.045em] text-white sm:text-6xl">Terms of Service</h1>
          <p className="mt-4 text-sm text-slate-400">Effective August 14, 2026 · Last updated August 22, 2026</p>
          <p className="mt-6 max-w-3xl text-base leading-7 text-slate-300">These terms are designed to make the expectations around Smartlearn&apos;s learning tools, AI assistance, subscriptions, and connected course data clear.</p>

          <div className="mt-10 space-y-4">
            {sections.map((section) => (
              <section key={section.title} className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 sm:p-6">
                <h2 className="text-lg font-semibold tracking-tight text-white">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300">{section.body}</div>
              </section>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5 text-sm leading-6 text-amber-100/90">
            Consumer-protection, education, privacy, and subscription laws vary by jurisdiction. Smartlearn will honor rights that cannot be waived by contract.
          </div>
        </div>
      </main>
      <SmartlearnFooter />
    </SmartlearnBackdrop>
  );
}
