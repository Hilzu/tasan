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
          Last updated: <time dateTime="2026-11-20">20 November 2026</time>
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
          We use Amazon Web Services (AWS) for hosting, storage, content
          delivery and logging. The application database is stored in Germany,
          with copies in Singapore and the United States. AWS routes requests
          through its network. The application in Singapore handles requests
          routed through certain Asia-Pacific AWS locations. Access logs are
          stored in the United States. Edge-function logs are stored in the
          region where the function runs: the EEA (Germany and Ireland), the
          United States, the United Kingdom, Japan, South Korea, Brazil, India,
          Singapore or Australia. The United Kingdom, Japan, South Korea and
          Brazil have EU adequacy decisions. AWS is certified under the{" "}
          <Link to="https://aws.amazon.com/compliance/eu-us-data-privacy-framework/">
            EU-U.S. Data Privacy Framework
          </Link>{" "}
          as a covered entity under Amazon.com, Inc.’s certification. Transfers
          to Singapore, India and Australia rely on the Standard Contractual
          Clauses in the{" "}
          <Link to="https://d1.awsstatic.com/legal/aws-dpa/aws-dpa.pdf">
            AWS Data Processing Addendum
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
          Authenticated sessions end after seven days of inactivity or after 30
          days at most. Invitation links expire after five days. Expired
          sessions and invitations stop working immediately; DynamoDB deletes
          their records asynchronously, usually within a few days. Access logs
          are kept for three months and include IP addresses, browser and
          connection details, and request details, including URLs and referrers,
          which can contain invitation identifiers or one-time sign-in codes.
          Cookies are not logged. Application and edge-function logs are kept
          for 13 months and include request and error details, including reports
          you choose to submit. Support correspondence is retained until the
          request and any related follow-up or disputes are resolved. Applicable
          legal obligations or specific legal claims may require longer
          retention.
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
