import { MainHeading, SubHeading } from "~/components/heading";
import { Link } from "~/components/link";

import type { Route } from "./+types/privacy";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Privacy notice - Tasan.app" },
    {
      name: "description",
      content:
        "How Tasan uses personal data and how to exercise your privacy rights.",
    },
  ];
}

export default function Privacy() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 leading-relaxed">
      <header className="space-y-2">
        <MainHeading>Privacy notice</MainHeading>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Last updated: <time dateTime="2026-11-03">3 November 2026</time>
        </p>
        <p>
          Santeri Consulting Oy, Finland, is the controller of personal data
          processed through Tasan. Contact:{" "}
          <Link to="mailto:tasan@santeri.consulting">
            tasan@santeri.consulting
          </Link>
          .
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="data">
        <SubHeading>
          <span id="data">Data and purposes</span>
        </SubHeading>
        <p>
          We process account and contact details, settings, authentication
          information, shared financial records and their change history,
          technical information (including IP addresses, request information and
          diagnostics), and support messages. Data comes from you, other
          participants in your splits, our authentication provider and your use
          of the service.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Providing the service (GDPR Article 6(1)(b)):</strong>{" "}
            managing your account and shared financial records, applying
            settings and calculating balances.
          </li>
          <li>
            <strong>Legitimate interests (Article 6(1)(f)):</strong> maintaining
            accurate shared records, resolving disputed entries, providing
            support, diagnosing problems and protecting the service against
            abuse. These are our interests and, for shared records, those of
            other participants.
          </li>
          <li>
            <strong>Legal obligations (Article 6(1)(c)):</strong> handling
            privacy requests and complying with applicable legal requirements.
          </li>
        </ul>
        <p>
          Account and shared financial information is necessary to provide the
          corresponding service; without it those functions cannot be provided.
          Providing it is not a statutory requirement. Support messages and
          diagnostic reports you submit are optional.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="sharing">
        <SubHeading>
          <span id="sharing">Recipients and international transfers</span>
        </SubHeading>
        <p>
          Split members can see shared records and member details, including
          names and email addresses. People with a valid invitation link can
          join the split. Authorized maintainers, Amazon Web Services (AWS) and
          its subprocessors, and email service providers process data for
          operation and support. Data may also be disclosed where required by
          law or necessary for legal claims.
        </p>
        <p>
          We use AWS for hosting, replication, content delivery and logging.
          Data is processed within and outside the European Economic Area,
          including Australia, Brazil, India, Japan, Singapore, South Korea, the
          United Kingdom and the United States. AWS identifies additional
          processing locations in its{" "}
          <Link to="https://aws.amazon.com/compliance/sub-processors/">
            subprocessors list
          </Link>
          . Transfers to countries without an applicable adequacy decision rely
          on the European Commission’s Standard Contractual Clauses incorporated
          into AWS’s data processing terms. The safeguards are described in{" "}
          <Link to="https://aws.amazon.com/compliance/gdpr-center/">
            AWS’s GDPR information
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="retention">
        <SubHeading>
          <span id="retention">Retention</span>
        </SubHeading>
        <p>
          Account data is retained until account deletion; inactivity alone does
          not trigger deletion. You can request deletion using the contact
          details below. Shared records and their history are retained while
          participants continue to use the split, or while outstanding balances
          or disputes remain. When those reasons no longer apply, personal data
          is deleted or anonymized, subject to the legal exceptions below.
          Account deletion does not automatically remove shared records still
          needed by other participants. There is no automatic inactivity expiry.
          Deleting an expense removes it from active balances but retains its
          history and deletion record.
        </p>
        <p>
          Sessions and invitations are retained until expiry or revocation;
          expired database records are removed asynchronously. Logs expire after
          13 months. Support correspondence is retained until the request and
          any related follow-up or disputes are resolved. Applicable legal
          obligations or specific legal claims may require longer retention.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="cookies">
        <SubHeading>
          <span id="cookies">Cookies</span>
        </SubHeading>
        <p>
          Tasan uses necessary cookies to provide sign-in, maintain sessions and
          protect the service. Blocking these cookies may prevent those
          functions from working.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="rights">
        <SubHeading>
          <span id="rights">Your rights</span>
        </SubHeading>
        <p>
          Subject to the GDPR’s conditions, you can request access to and a copy
          of your personal data, correction, erasure, restriction of processing,
          and portability of data you provided that is processed automatically
          under a contract.
        </p>
        <p>
          <strong>
            You can object to processing based on legitimate interests on
            grounds relating to your particular situation.
          </strong>
        </p>
        <p>
          To exercise your rights, contact{" "}
          <Link to="mailto:tasan@santeri.consulting">
            tasan@santeri.consulting
          </Link>
          . You can also lodge a complaint with the{" "}
          <Link to="https://tietosuoja.fi/en/notification-to-the-data-protection-ombudsman">
            Finnish Data Protection Ombudsman
          </Link>{" "}
          or the supervisory authority where you live or work in the EEA or
          where an alleged infringement occurred.
        </p>
      </section>
    </article>
  );
}
