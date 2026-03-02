import PublicLayout from "@/components/public-layout";

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <section className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">PRIVACY POLICY</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-privacy">
              Your privacy matters to us.
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">Last updated: March 2026</p>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-information-we-collect">1. Information We Collect</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                We collect the minimum information necessary to operate the service:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li><strong className="text-foreground">Account information:</strong> name, email address, and hashed password.</li>
                <li><strong className="text-foreground">Organization data:</strong> team names, member roles, and provider configurations.</li>
                <li><strong className="text-foreground">Usage metadata:</strong> token counts, model identifiers, timestamps, and cost estimates per API call.</li>
                <li><strong className="text-foreground">Billing information:</strong> managed securely through Stripe. We do not store credit card numbers.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                <strong className="text-foreground">We do NOT collect or store:</strong> prompts, completions, conversation history, or any content sent to AI providers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-how-we-use">2. How We Use Information</h2>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li>Authenticate users and manage team memberships.</li>
                <li>Track and enforce usage budgets for teams and vouchers.</li>
                <li>Generate analytics dashboards for organization admins.</li>
                <li>Process billing and payments via Stripe.</li>
                <li>Send transactional emails (budget alerts, account notifications).</li>
                <li>Improve service reliability and performance.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-data-storage">3. Data Storage &amp; Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                All data is stored in PostgreSQL with encryption at rest. API keys stored on behalf of organizations are encrypted
                using AES-256-GCM before being written to the database. User passwords are hashed using bcrypt. All connections
                are secured with HTTPS/TLS in transit.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-third-party">4. Third-Party Services</h2>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li><strong className="text-foreground">Stripe:</strong> payment processing and subscription management.</li>
                <li><strong className="text-foreground">AI providers (OpenAI, Anthropic, Google):</strong> API calls are made directly from the client (Teams) or proxied without storage (Vouchers). We do not share your data with these providers beyond the API calls you initiate.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-data-retention">5. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                Usage data retention varies by plan:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li><strong className="text-foreground">Free plan:</strong> 7 days of usage history.</li>
                <li><strong className="text-foreground">Team plan:</strong> 90 days of usage history.</li>
                <li><strong className="text-foreground">Enterprise plan:</strong> 1 year of usage history.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Account data is retained for the duration of your account. Upon deletion, all associated data is permanently removed within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-your-rights">6. Your Rights</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">You have the right to:</p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li><strong className="text-foreground">Access:</strong> request a copy of the data we hold about you.</li>
                <li><strong className="text-foreground">Correction:</strong> update or correct inaccurate information.</li>
                <li><strong className="text-foreground">Deletion:</strong> request permanent deletion of your account and data.</li>
                <li><strong className="text-foreground">Export:</strong> download your usage data in a machine-readable format.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                To exercise any of these rights, contact us at{" "}
                <a href="mailto:privacy@allotly.com" className="text-indigo-500 hover:text-indigo-400 transition-colors">privacy@allotly.com</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-cookies">7. Cookies</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use essential cookies only: a session cookie to keep you logged in and a preference cookie for theme selection.
                We do not use advertising or tracking cookies. No third-party analytics scripts are loaded.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-contact-privacy">8. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                For privacy-related inquiries, reach us at{" "}
                <a href="mailto:privacy@allotly.com" className="text-indigo-500 hover:text-indigo-400 transition-colors">privacy@allotly.com</a>.
              </p>
            </section>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}