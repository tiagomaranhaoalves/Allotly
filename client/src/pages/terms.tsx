import PublicLayout from "@/components/public-layout";

export default function TermsPage() {
  return (
    <PublicLayout>
      <section className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">TERMS OF SERVICE</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-terms">
              Terms of Service
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">Last updated: March 2026</p>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-acceptance">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using Allotly ("the Service"), you agree to be bound by these Terms of Service. If you do not agree
                to these terms, do not use the Service. These terms apply to all users, including organization administrators,
                team members, and voucher recipients.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-account-registration">2. Account Registration</h2>
              <p className="text-muted-foreground leading-relaxed">
                You must provide accurate and complete information when creating an account. You are responsible for maintaining
                the security of your account credentials and for all activity that occurs under your account. You must notify us
                immediately of any unauthorized use.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-service-description">3. Service Description</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Allotly provides an AI spend management platform with two primary access models:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li><strong className="text-foreground">Teams:</strong> Organizations connect their own AI provider API keys. Allotly manages access, tracks usage, and enforces budgets. API calls go directly from clients to providers — Allotly never touches prompt or completion data.</li>
                <li><strong className="text-foreground">Vouchers:</strong> Pre-paid, scoped AI access codes. Calls are proxied through Allotly for metering only — prompts and completions are never stored.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-billing">4. Billing &amp; Payments</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Allotly offers three subscription tiers:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li><strong className="text-foreground">Free:</strong> limited to 1 team, 3 members, and 2 provider connections.</li>
                <li><strong className="text-foreground">Team ($49/mo):</strong> up to 5 teams, 25 members, and 10 provider connections with advanced analytics.</li>
                <li><strong className="text-foreground">Enterprise (custom):</strong> unlimited teams, members, and providers with dedicated support.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Voucher Bundles are one-time purchases with defined credit amounts and expiration dates. All payments are processed
                through Stripe. Prices are in USD unless otherwise specified.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-acceptable-use">5. Acceptable Use</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">You agree not to:</p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
                <li>Attempt to gain unauthorized access to any part of the Service or its infrastructure.</li>
                <li>Interfere with or disrupt the integrity or performance of the Service.</li>
                <li>Resell or redistribute the Service without prior written consent.</li>
                <li>Use the Service to circumvent AI provider terms of service.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-api-usage">6. API Usage &amp; Rate Limits</h2>
              <p className="text-muted-foreground leading-relaxed">
                API usage is subject to rate limits based on your subscription plan. Exceeding these limits may result in
                temporary throttling. Sustained abuse may lead to account suspension. We reserve the right to modify rate
                limits with reasonable notice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-intellectual-property">7. Intellectual Property</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service, including its design, features, and documentation, is the intellectual property of Allotly.
                You retain all rights to your data and content. We claim no ownership over prompts, completions, or any
                content processed through AI providers via the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-limitation-liability">8. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                To the maximum extent permitted by law, Allotly shall not be liable for any indirect, incidental, special,
                consequential, or punitive damages, including loss of profits, data, or business opportunities. Our total
                liability shall not exceed the amount paid by you in the twelve months preceding the claim.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-termination">9. Termination</h2>
              <p className="text-muted-foreground leading-relaxed">
                You may cancel your subscription at any time. Upon cancellation, your account will remain active for a
                30-day grace period, after which access will be downgraded to the Free plan. We reserve the right to
                suspend or terminate accounts that violate these terms, with notice when possible.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-changes">10. Changes to Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update these terms from time to time. Material changes will be communicated via email or in-app
                notification at least 30 days before taking effect. Continued use of the Service after changes constitutes
                acceptance of the updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-governing-law">11. Governing Law</h2>
              <p className="text-muted-foreground leading-relaxed">
                These terms shall be governed by and construed in accordance with the laws of the State of Delaware,
                United States, without regard to its conflict of law provisions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-contact-terms">12. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                For questions about these terms, contact us at{" "}
                <a href="mailto:legal@allotly.com" className="text-indigo-500 hover:text-indigo-400 transition-colors">legal@allotly.com</a>.
              </p>
            </section>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}