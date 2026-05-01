import { useEffect } from "react";
import { Link } from "wouter";
import PublicLayout from "@/components/public-layout";

const PAGE_TITLE = "Sub-processors | Allotly";
const PAGE_DESCRIPTION =
  "List of third-party Sub-processors engaged by Allotly to provide the AI access governance platform, including hosting, database, payment, and email infrastructure.";

function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let metaDesc = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDesc = metaDesc?.getAttribute("content") ?? null;
    const created = !metaDesc;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", description);

    return () => {
      document.title = previousTitle;
      if (created) {
        metaDesc?.remove();
      } else if (previousDesc !== null) {
        metaDesc?.setAttribute("content", previousDesc);
      }
    };
  }, [title, description]);
}

const SECURITY_EMAIL = "security@allotly.ai";

type Subprocessor = {
  name: string;
  purpose: string;
  location: string;
  testId: string;
};

const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Replit, Inc.",
    purpose:
      "Application hosting and compute (Replit Deployments, autoscale)",
    location: "United States (Google Cloud, us-central1)",
    testId: "replit",
  },
  {
    name: "Neon Inc. (via Replit Database)",
    purpose: "Managed PostgreSQL hosting (encryption at rest)",
    location: "United States",
    testId: "neon",
  },
  {
    name: "Stripe, Inc.",
    purpose: "Payment processing and subscription management",
    location: "United States",
    testId: "stripe",
  },
  {
    name: "Resend (Resend.com, Inc.)",
    purpose:
      "Transactional email delivery (verification, invites, notifications)",
    location: "United States",
    testId: "resend",
  },
];

export default function SubprocessorsPage() {
  useDocumentMeta(PAGE_TITLE, PAGE_DESCRIPTION);

  return (
    <PublicLayout>
      <section className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">
              Legal
            </p>
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
              data-testid="heading-subprocessors"
            >
              Sub-processors
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Last updated: May 2026
            </p>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
            <section>
              <p className="text-muted-foreground leading-relaxed mb-3">
                This page lists the third-party Sub-processors that Allotly
                engages to provide the Service. Sub-processors are bound by
                written contracts imposing data protection obligations no less
                protective than those in our{" "}
                <Link
                  href="/dpa"
                  className="text-indigo-500 hover:text-indigo-400 transition-colors"
                  data-testid="link-dpa"
                >
                  Data Processing Agreement
                </Link>
                .
              </p>
              <p className="text-muted-foreground leading-relaxed">
                We notify Customers of any intended additions or replacements
                of Sub-processors at least 30 days in advance, either via this
                page or by email to the account administrator. To receive
                change notifications, email{" "}
                <a
                  href={`mailto:${SECURITY_EMAIL}?subject=Subprocessor%20notifications`}
                  className="text-indigo-500 hover:text-indigo-400 transition-colors"
                  data-testid="link-security-email-notifications"
                >
                  {SECURITY_EMAIL}
                </a>{" "}
                with the subject line &quot;Subprocessor notifications&quot;.
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-current-subprocessors"
              >
                Current Sub-processors
              </h2>
              <div className="not-prose overflow-x-auto -mx-4 sm:mx-0">
                <table
                  className="w-full border-collapse text-sm min-w-[640px]"
                  data-testid="table-subprocessors"
                >
                  <thead>
                    <tr className="bg-muted/60 dark:bg-muted/30">
                      <th className="text-left font-semibold text-foreground p-3 border border-border align-top">
                        Sub-processor
                      </th>
                      <th className="text-left font-semibold text-foreground p-3 border border-border align-top">
                        Purpose
                      </th>
                      <th className="text-left font-semibold text-foreground p-3 border border-border align-top">
                        Location of processing
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    {SUBPROCESSORS.map((sp) => (
                      <tr key={sp.testId} data-testid={`row-${sp.testId}`}>
                        <td
                          className="p-3 border border-border align-top font-medium text-foreground"
                          data-testid={`cell-name-${sp.testId}`}
                        >
                          {sp.name}
                        </td>
                        <td
                          className="p-3 border border-border align-top"
                          data-testid={`cell-purpose-${sp.testId}`}
                        >
                          {sp.purpose}
                        </td>
                        <td
                          className="p-3 border border-border align-top"
                          data-testid={`cell-location-${sp.testId}`}
                        >
                          {sp.location}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground leading-relaxed mt-4 text-sm">
                <strong className="text-foreground">
                  Operational telemetry:{" "}
                </strong>
                Allotly does not currently engage a third-party error
                monitoring or application performance monitoring provider.
                Operational logs and crash data are retained within the
                hosting provider&apos;s platform and are not shared with
                third parties beyond what is necessary to operate the
                Service.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3 text-sm">
                <strong className="text-foreground">
                  Internal caching layer:{" "}
                </strong>
                Allotly uses an in-memory and Redis-compatible cache for
                short-lived rate-limit counters, concurrency tokens, and
                cached pricing metadata. Cache entries are keyed by opaque
                internal identifiers and contain no Personal Data on their
                own.
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-ai-providers"
              >
                AI providers
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                The following are{" "}
                <strong className="text-foreground">
                  not Sub-processors of Allotly
                </strong>
                . When a Customer&apos;s end-user sends a prompt through the
                Service, the prompt is forwarded to the AI provider selected
                by that end-user, under that provider&apos;s own terms and
                privacy policy. Allotly does not store the content of prompts
                or completions.
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li>OpenAI</li>
                <li>Anthropic</li>
                <li>Google (Gemini / Vertex AI)</li>
                <li>Microsoft Azure OpenAI Service</li>
                <li>
                  Any additional providers enabled by the Customer&apos;s
                  configuration.
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                The Customer is responsible for ensuring that its use of these
                providers is consistent with its own data protection
                obligations.
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-contact-subprocessors"
              >
                Contact
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                For questions about our Sub-processors or to request a list of
                historical changes:{" "}
                <a
                  href={`mailto:${SECURITY_EMAIL}`}
                  className="text-indigo-500 hover:text-indigo-400 transition-colors"
                  data-testid="link-security-email-contact"
                >
                  {SECURITY_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
