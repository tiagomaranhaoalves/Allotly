import { useEffect } from "react";
import { Link } from "wouter";
import PublicLayout from "@/components/public-layout";

const PAGE_TITLE = "Data Processing Agreement | Allotly";
const PAGE_DESCRIPTION =
  "Allotly's Data Processing Agreement (DPA). Article 28 GDPR compliant terms for Customers processing Personal Data through the Allotly AI access governance platform.";

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

export default function DpaPage() {
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
              data-testid="heading-dpa"
            >
              Data Processing Agreement
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Last updated: May 2026
            </p>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
            <section>
              <p className="text-muted-foreground leading-relaxed mb-3">
                This Data Processing Agreement (&quot;DPA&quot;) forms part of
                the agreement between{" "}
                <strong className="text-foreground">DivBZ Ventures Ltd</strong>{" "}
                (&quot;Allotly&quot;, &quot;we&quot;, &quot;us&quot;, the
                &quot;Processor&quot;) and the customer entity that has
                subscribed to Allotly&apos;s services (the &quot;Customer&quot;,
                &quot;you&quot;, the &quot;Controller&quot;) for the use of
                Allotly&apos;s AI access governance platform (the
                &quot;Service&quot;).
              </p>
              <p className="text-muted-foreground leading-relaxed mb-3">
                This DPA applies whenever Allotly processes Personal Data on
                behalf of the Customer in the course of providing the Service,
                and is intended to satisfy the requirements of Article 28 of
                the UK GDPR and the EU GDPR (together, &quot;GDPR&quot;).
              </p>
              <p className="text-muted-foreground leading-relaxed">
                By subscribing to a Team or Enterprise plan, the Customer is
                deemed to have entered into this DPA. A countersigned copy is
                available on request at{" "}
                <a
                  href={`mailto:${SECURITY_EMAIL}`}
                  className="text-indigo-500 hover:text-indigo-400 transition-colors"
                  data-testid="link-security-email-intro"
                >
                  {SECURITY_EMAIL}
                </a>
                .
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-definitions"
              >
                1. Definitions
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Terms not defined here have the meanings given to them in the
                GDPR.
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Personal Data: </strong>
                  any information relating to an identified or identifiable
                  natural person processed by Allotly on behalf of the Customer
                  through the Service.
                </li>
                <li>
                  <strong className="text-foreground">Data Subject: </strong>
                  an identified or identifiable natural person to whom Personal
                  Data relates (typically, the Customer&apos;s end-users —
                  employees, students, contractors, or other individuals issued
                  access by the Customer).
                </li>
                <li>
                  <strong className="text-foreground">Sub-processor: </strong>
                  a third party engaged by Allotly to process Personal Data on
                  behalf of the Customer.
                </li>
                <li>
                  <strong className="text-foreground">
                    Restricted Transfer:{" "}
                  </strong>
                  a transfer of Personal Data from the UK or EEA to a country
                  not benefiting from an adequacy decision.
                </li>
              </ul>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-roles-scope"
              >
                2. Roles and scope
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                The Customer is the Controller of the Personal Data. Allotly
                is the Processor, acting only on the Customer&apos;s documented
                instructions, which are deemed to be the instructions set out
                in this DPA, the Allotly Terms of Service, and the
                configuration choices the Customer makes within the Service.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-3">
                This DPA does not apply to:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li>
                  Personal Data of which Allotly is itself the Controller
                  (e.g., the Customer&apos;s billing contact details, account
                  administrator credentials, or marketing preferences), which
                  are governed by the{" "}
                  <a
                    href="https://allotly.ai/privacy"
                    className="text-indigo-500 hover:text-indigo-400 transition-colors"
                    data-testid="link-privacy-policy"
                  >
                    Allotly Privacy Policy
                  </a>
                  .
                </li>
                <li>
                  The content of prompts or completions exchanged with
                  third-party AI providers, which Allotly does not store. Such
                  content is processed by the AI provider selected by the
                  Customer&apos;s end-user under that provider&apos;s own
                  terms.
                </li>
              </ul>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-subject-matter"
              >
                3. Subject matter, duration, nature, and purpose of processing
              </h2>
              <div className="not-prose overflow-x-auto -mx-4 sm:mx-0">
                <table
                  className="w-full border-collapse text-sm min-w-[640px]"
                  data-testid="table-processing-details"
                >
                  <thead>
                    <tr className="bg-muted/60 dark:bg-muted/30">
                      <th className="text-left font-semibold text-foreground p-3 border border-border align-top w-1/3">
                        Item
                      </th>
                      <th className="text-left font-semibold text-foreground p-3 border border-border align-top">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr data-testid="row-subject-matter">
                      <td
                        className="p-3 border border-border align-top font-medium text-foreground"
                        data-testid="cell-item-subject-matter"
                      >
                        Subject matter
                      </td>
                      <td
                        className="p-3 border border-border align-top"
                        data-testid="cell-detail-subject-matter"
                      >
                        Provision of the Allotly AI access governance
                        platform.
                      </td>
                    </tr>
                    <tr data-testid="row-duration">
                      <td
                        className="p-3 border border-border align-top font-medium text-foreground"
                        data-testid="cell-item-duration"
                      >
                        Duration
                      </td>
                      <td
                        className="p-3 border border-border align-top"
                        data-testid="cell-detail-duration"
                      >
                        The term of the Customer&apos;s subscription, plus any
                        retention period specified in §12.
                      </td>
                    </tr>
                    <tr data-testid="row-nature">
                      <td
                        className="p-3 border border-border align-top font-medium text-foreground"
                        data-testid="cell-item-nature"
                      >
                        Nature of processing
                      </td>
                      <td
                        className="p-3 border border-border align-top"
                        data-testid="cell-detail-nature"
                      >
                        Authentication, authorization, budget enforcement,
                        usage metering, audit logging, and admin reporting.
                      </td>
                    </tr>
                    <tr data-testid="row-purpose">
                      <td
                        className="p-3 border border-border align-top font-medium text-foreground"
                        data-testid="cell-item-purpose"
                      >
                        Purpose
                      </td>
                      <td
                        className="p-3 border border-border align-top"
                        data-testid="cell-detail-purpose"
                      >
                        To allow the Customer to provision, govern, and monitor
                        scoped AI access for its end-users.
                      </td>
                    </tr>
                    <tr data-testid="row-data-subjects">
                      <td
                        className="p-3 border border-border align-top font-medium text-foreground"
                        data-testid="cell-item-data-subjects"
                      >
                        Categories of Data Subjects
                      </td>
                      <td
                        className="p-3 border border-border align-top"
                        data-testid="cell-detail-data-subjects"
                      >
                        The Customer&apos;s end-users (e.g., employees,
                        students, contractors) issued access by the Customer.
                      </td>
                    </tr>
                    <tr data-testid="row-personal-data">
                      <td
                        className="p-3 border border-border align-top font-medium text-foreground"
                        data-testid="cell-item-personal-data"
                      >
                        Categories of Personal Data
                      </td>
                      <td
                        className="p-3 border border-border align-top"
                        data-testid="cell-detail-personal-data"
                      >
                        Name, email, role/team membership, voucher and access
                        scope, usage metadata (token counts, model identifiers,
                        timestamps, cost estimates).
                      </td>
                    </tr>
                    <tr data-testid="row-special-category">
                      <td
                        className="p-3 border border-border align-top font-medium text-foreground"
                        data-testid="cell-item-special-category"
                      >
                        Special category data
                      </td>
                      <td
                        className="p-3 border border-border align-top"
                        data-testid="cell-detail-special-category"
                      >
                        None expected. The Customer must not configure the
                        Service to process special category data.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-allotly-obligations"
              >
                4. Allotly&apos;s obligations
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Allotly will:
              </p>
              <ol className="list-decimal pl-6 space-y-1.5 text-muted-foreground">
                <li>
                  Process Personal Data only on the Customer&apos;s documented
                  instructions, including with regard to Restricted Transfers,
                  unless required by law (in which case Allotly will inform
                  the Customer unless legally prohibited).
                </li>
                <li>
                  Ensure that personnel authorised to process Personal Data
                  are bound by appropriate confidentiality obligations.
                </li>
                <li>
                  Implement appropriate technical and organisational measures
                  as set out in §7.
                </li>
                <li>
                  Assist the Customer, taking into account the nature of the
                  processing, in fulfilling its obligations to respond to Data
                  Subject requests under §8.
                </li>
                <li>
                  Assist the Customer in ensuring compliance with its
                  obligations under Articles 32–36 GDPR (security, breach
                  notification, data protection impact assessments, prior
                  consultation), to the extent reasonably required.
                </li>
                <li>
                  At the Customer&apos;s choice, delete or return all Personal
                  Data after the end of the provision of services, as set out
                  in §12.
                </li>
                <li>
                  Make available to the Customer all information necessary to
                  demonstrate compliance with Article 28 GDPR, and allow for
                  and contribute to audits as set out in §9.
                </li>
              </ol>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-customer-obligations"
              >
                5. Customer&apos;s obligations
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                The Customer warrants that:
              </p>
              <ol className="list-decimal pl-6 space-y-1.5 text-muted-foreground">
                <li>
                  It has a lawful basis for the processing it instructs
                  Allotly to perform, and has provided all necessary notices
                  and obtained all necessary consents from Data Subjects.
                </li>
                <li>
                  Its instructions to Allotly comply with applicable law.
                </li>
                <li>
                  It will not configure the Service to process Personal Data
                  outside the categories listed in §3, including special
                  category data.
                </li>
              </ol>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-subprocessors"
              >
                6. Sub-processors
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                The Customer provides a general authorisation for Allotly to
                engage Sub-processors to provide the Service. The current list
                of Sub-processors is published at{" "}
                <a
                  href="https://allotly.ai/subprocessors"
                  className="text-indigo-500 hover:text-indigo-400 transition-colors"
                  data-testid="link-subprocessors-page"
                >
                  allotly.ai/subprocessors
                </a>{" "}
                and includes, at minimum, the cloud hosting, database,
                payment, and email infrastructure providers necessary to
                operate the Service.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Allotly will:
              </p>
              <ol className="list-decimal pl-6 space-y-1.5 text-muted-foreground">
                <li>
                  Enter into a written contract with each Sub-processor
                  imposing data protection obligations no less protective than
                  those in this DPA.
                </li>
                <li>
                  Remain liable for the acts and omissions of its
                  Sub-processors as if they were its own.
                </li>
                <li>
                  Notify the Customer of any intended additions or
                  replacements of Sub-processors with at least 30 days&apos;
                  notice (via the Sub-processors page or email to the account
                  administrator). The Customer may object on reasonable
                  data-protection grounds within that period; if the parties
                  cannot resolve the objection, the Customer may terminate the
                  affected portion of the Service.
                </li>
              </ol>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-security-measures"
              >
                7. Security measures
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Allotly implements and maintains the following technical and
                organisational measures:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li>
                  <strong className="text-foreground">
                    Encryption in transit:{" "}
                  </strong>
                  all connections secured with HTTPS/TLS.
                </li>
                <li>
                  <strong className="text-foreground">
                    Encryption at rest:{" "}
                  </strong>
                  PostgreSQL with encryption at rest. Customer-supplied AI
                  provider API keys encrypted using AES-256-GCM before
                  storage.
                </li>
                <li>
                  <strong className="text-foreground">Authentication: </strong>
                  user passwords hashed with scrypt; administrative access
                  protected by multi-factor authentication.
                </li>
                <li>
                  <strong className="text-foreground">Access control: </strong>
                  role-based access controls; principle of least privilege for
                  personnel.
                </li>
                <li>
                  <strong className="text-foreground">
                    Logging and monitoring:{" "}
                  </strong>
                  audit logs for administrative and access-relevant actions.
                </li>
                <li>
                  <strong className="text-foreground">Backups: </strong>
                  encrypted backups with defined retention and purge schedules
                  (see §12).
                </li>
                <li>
                  <strong className="text-foreground">
                    Vendor management:{" "}
                  </strong>
                  Sub-processors subject to written data protection
                  commitments.
                </li>
                <li>
                  <strong className="text-foreground">
                    Incident response:{" "}
                  </strong>
                  documented procedures for detecting, investigating, and
                  notifying personal data breaches.
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Allotly will review and update these measures periodically to
                reflect evolving best practice and the risk profile of the
                processing.
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-data-subject-rights"
              >
                8. Data subject rights and assistance
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Allotly will, taking into account the nature of the
                processing, provide reasonable assistance to the Customer (by
                appropriate technical and organisational measures, insofar as
                possible) in responding to requests from Data Subjects
                exercising their rights under Articles 15–22 GDPR.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Where Allotly receives a request directly from a Data Subject
                relating to Personal Data processed on behalf of the Customer,
                Allotly will, unless otherwise required by law, redirect the
                Data Subject to the Customer.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                The Customer can self-serve most rights requests through the
                Service&apos;s account administration tools (data export,
                deletion of end-user records, correction of metadata).
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-audits"
              >
                9. Audits
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Allotly will, on the Customer&apos;s reasonable written
                request and no more than once per twelve-month period (except
                following a personal data breach affecting the Customer&apos;s
                data), make available information reasonably necessary to
                demonstrate compliance with this DPA. This may take the form
                of:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li>
                  Up-to-date third-party certifications or audit reports
                  (e.g., SOC 2, ISO 27001) where available; or
                </li>
                <li>
                  Written responses to a reasonable security questionnaire.
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                On-site audits are available to Enterprise-plan Customers,
                subject to reasonable notice, scope, and confidentiality
                terms, and at the Customer&apos;s cost (except where the audit
                reveals material non-compliance by Allotly).
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-breach-notification"
              >
                10. Breach notification
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Allotly will notify the Customer without undue delay, and in
                any event within 72 hours, after becoming aware of a personal
                data breach affecting the Customer&apos;s Personal Data. The
                notification will include, to the extent then known, the
                information required under Article 33(3) GDPR. Allotly will
                provide updates as further information becomes available and
                will cooperate reasonably with the Customer in investigating
                and remediating the breach.
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-international-transfers"
              >
                11. International transfers
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Where the provision of the Service involves a Restricted
                Transfer of Personal Data, the parties agree that:
              </p>
              <ol className="list-decimal pl-6 space-y-1.5 text-muted-foreground">
                <li>
                  Such transfers are made under appropriate safeguards,
                  including the European Commission&apos;s Standard
                  Contractual Clauses (SCCs) and the UK International Data
                  Transfer Addendum, which are deemed to be incorporated by
                  reference into this DPA.
                </li>
                <li>
                  The Customer is the data exporter and Allotly is the data
                  importer for transfers from the Customer to Allotly. For
                  onward transfers to Sub-processors located outside the
                  UK/EEA, Allotly will ensure equivalent safeguards are in
                  place.
                </li>
                <li>
                  Where applicable, Module Two (controller to processor) of
                  the SCCs applies.
                </li>
              </ol>
              <p className="text-muted-foreground leading-relaxed mt-3">
                A copy of the executed SCCs and UK Addendum is available on
                request.
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-return-deletion"
              >
                12. Return and deletion of data
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                On termination or expiry of the Customer&apos;s subscription,
                Allotly will, at the Customer&apos;s choice:
              </p>
              <ol className="list-decimal pl-6 space-y-1.5 text-muted-foreground">
                <li>
                  Return all Personal Data processed on behalf of the Customer
                  in a structured, commonly used, machine-readable format; or
                </li>
                <li>Delete all such Personal Data,</li>
              </ol>
              <p className="text-muted-foreground leading-relaxed mt-3">
                within 30 days, except where retention is required by law
                (e.g., billing records held for statutory accounting periods).
                Encrypted backups are purged within a further 30 days.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                If the Customer makes no election, Allotly will delete the
                Personal Data after the periods set out above.
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-liability"
              >
                13. Liability
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Each party&apos;s liability under or in connection with this
                DPA is subject to the limitations and exclusions of liability
                set out in the{" "}
                <Link
                  href="/terms"
                  className="text-indigo-500 hover:text-indigo-400 transition-colors"
                  data-testid="link-terms-of-service"
                >
                  Allotly Terms of Service
                </Link>
                . Nothing in this DPA limits or excludes liability that cannot
                be limited or excluded under applicable law.
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-conflict-precedence"
              >
                14. Conflict and order of precedence
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                In the event of a conflict between this DPA and the Allotly
                Terms of Service in respect of the processing of Personal
                Data, this DPA prevails. In the event of a conflict between
                this DPA and the SCCs incorporated by reference under §11,
                the SCCs prevail.
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-governing-law"
              >
                15. Governing law
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                This DPA is governed by the laws of{" "}
                <strong className="text-foreground">England and Wales</strong>,
                and disputes are subject to the exclusive jurisdiction of the
                courts of{" "}
                <strong className="text-foreground">England and Wales</strong>,
                save that the SCCs and UK Addendum are governed by the laws
                and supervised by the authorities specified within them.
              </p>
            </section>

            <section>
              <h2
                className="text-xl font-semibold mb-3"
                data-testid="section-contact-dpa"
              >
                16. Contact
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                For all matters relating to this DPA, including requests for a
                countersigned copy, audit information, or breach
                notifications:{" "}
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
