import { MainHeading, SubHeading } from "~/components/heading";
import { Link } from "~/components/link";

import type { Route } from "./+types/privacy";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Privacy notice - Tasan.app" },
    {
      name: "description",
      content:
        "How Tasan handles your account, shared expenses and technical data, and how to exercise your privacy rights.",
    },
  ];
}

export default function Privacy() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 leading-relaxed">
      <header className="space-y-2">
        <MainHeading>Privacy notice</MainHeading>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Last updated: <time dateTime="2026-11-02">2 November 2026</time>
        </p>
        <p>
          Tasan helps you split bills with friends and keep track of balances.
          This notice explains how personal data is used when you visit
          tasan.app, create an account or take part in a split.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="controller">
        <SubHeading>
          <span id="controller">Who is responsible?</span>
        </SubHeading>
        <p>
          Santeri Consulting Oy, Finland, is the data controller. For privacy
          questions, account deletion or any of the requests below, email{" "}
          <Link to="mailto:tasan@santeri.consulting">
            tasan@santeri.consulting
          </Link>
          . The same contact handles data protection matters.
        </p>
        <p>
          Please use email for private questions. GitHub issues are public: do
          not post personal expense details, passwords or invitation links
          there.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="data">
        <SubHeading>
          <span id="data">What we collect and where it comes from</span>
        </SubHeading>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Account information:</strong> contact and profile details,
            such as your name and email address, account identifiers, account
            settings and authentication information.
          </li>
          <li>
            <strong>Shared financial records:</strong> information you and other
            participants provide to organize shared expenses and settle
            balances, including group membership, descriptions, amounts,
            currencies, payments and allocations. We also keep a history of
            changes and who made them.
          </li>
          <li>
            <strong>Session and access information:</strong> information needed
            to sign you in, maintain your session, manage invitations and
            control access to shared records.
          </li>
          <li>
            <strong>Technical information:</strong> IP addresses, browser and
            request information, usage and performance diagnostics, account and
            record identifiers, and error details needed to operate and protect
            the service.
          </li>
          <li>
            <strong>Support information:</strong> messages, reports and
            diagnostic information you choose to send us, which may be
            associated with your account.
          </li>
        </ul>
        <p>
          You provide account details, preferences and records directly. Other
          members of your splits can enter expenses and repayments involving
          you. Account details also come from our authentication provider, and
          technical information is generated when you use the service. Please
          avoid including sensitive information, such as health details, in
          descriptions or reports.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="purposes">
        <SubHeading>
          <span id="purposes">Why we use data and our legal bases</span>
        </SubHeading>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Providing Tasan (GDPR Article 6(1)(b)):</strong> creating
            and managing your account, applying your settings, organizing shared
            financial records and calculating and settling balances are
            necessary to provide the service you request.
          </li>
          <li>
            <strong>Legitimate interests (Article 6(1)(f)):</strong> we process
            security logs, diagnostics and support reports to prevent abuse,
            investigate failures and keep Tasan reliable. Maintaining shared
            records and their history also serves our and split members’
            interests in accurate balances and resolving disputed entries,
            including information entered about you by another member.
          </li>
          <li>
            <strong>Legal obligations (Article 6(1)(c)):</strong> where
            applicable, we process data to respond to statutory privacy requests
            and comply with binding legal requirements.
          </li>
        </ul>
        <p>
          Providing data is not a statutory requirement. Account and sign-in
          details are needed to use an account; shared financial information is
          needed to calculate and settle balances. Without the necessary data we
          cannot provide the relevant service. Support messages and diagnostic
          reports are optional. We do not rely on consent for the processing
          described here.
        </p>
        <p>
          Tasan does not sell personal data or use it for advertising. Balance
          and repayment calculations do not make legal or similarly significant
          automated decisions about you, and we do not profile you for such
          decisions.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="sharing">
        <SubHeading>
          <span id="sharing">Who can see your information</span>
        </SubHeading>
        <p>
          Members of the same split can see its shared records, revision
          history, balances and member information, including names and email
          addresses. Anyone with a valid invitation link can use it to join that
          split, so share links only with intended participants. Members may
          keep their own copies of information they have seen.
        </p>
        <p>
          Authorized people maintaining Tasan can access data where needed for
          operation, support, security and privacy requests. Amazon Web Services
          (AWS) and its subprocessors provide hosting, databases,
          authentication, email verification, logging and diagnostics on our
          behalf. Email service providers process correspondence when you
          contact us. We may disclose information to authorities where legally
          required, or where necessary to establish, exercise or defend legal
          claims.
        </p>
        <p>
          Following an external link takes you to a separate service with its
          own privacy practices. For example, GitHub links lead to a service
          governed by{" "}
          <Link to="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
            GitHub’s privacy statement
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="transfers">
        <SubHeading>
          <span id="transfers">Where data is processed</span>
        </SubHeading>
        <p>
          Tasan uses AWS to host and replicate data in Germany and Singapore,
          and may also use locations in the United States. Data may be stored
          and processed in more than one of these countries for availability and
          performance. AWS’s global delivery network also processes request data
          in locations worldwide. This involves transfers outside the European
          Economic Area (EEA).
        </p>
        <p>
          AWS’s Data Processing Addendum incorporates the European Commission’s
          Standard Contractual Clauses for transfers to countries without an
          applicable adequacy decision, including Singapore. These clauses
          provide contractual safeguards and enforceable rights for your data.
          See{" "}
          <Link to="https://aws.amazon.com/compliance/gdpr-center/">
            AWS’s information about these safeguards
          </Link>{" "}
          or contact us for a copy of the relevant safeguards.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="retention">
        <SubHeading>
          <span id="retention">How long data is kept</span>
        </SubHeading>
        <p>
          Account data is kept while your account is in use. Shared records and
          their history are kept while needed to maintain the split’s balances,
          let members check previous entries or resolve disputes. They currently
          have no automatic expiry. Deleting an expense hides it from the active
          balance calculation but keeps its earlier revisions and a deletion
          record; it does not erase the underlying personal data.
        </p>
        <p>
          You can request deletion by email. We assess whether data can be
          erased or anonymized, taking into account other members’ rights and
          any specific legal obligation or unresolved claim. We do not retain
          data merely because it might be useful someday. If we need to keep
          some information, we explain the reason and applicable retention
          criteria when responding to your request.
        </p>
        <p>
          Signing out deletes the app session. Session and invitation records
          are retained until they expire or are revoked; expired records are
          removed asynchronously. Application and edge logs, including submitted
          error reports, are stored across the AWS regions used to operate
          Tasan. Retention currently varies by log group: some application logs
          expire after 13 months, while other application and edge logs have no
          configured automatic expiry. Retention is assessed based on incident
          investigation, security and troubleshooting needs. Support
          correspondence is kept for handling your request and any related
          follow-up or dispute, then deleted when no longer needed.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="cookies">
        <SubHeading>
          <span id="cookies">Cookies and browser storage</span>
        </SubHeading>
        <p>
          Tasan and its sign-in service use first-party cookies to maintain your
          session, authenticate you and protect against forged requests. The
          app’s <code>__session</code> cookie contains a signed session
          identifier and lasts up to 14 days after it is set or renewed. These
          cookies are necessary to provide sign-in and do not require cookie
          consent. Blocking them prevents sign-in from working.
        </p>
        <p>
          We do not use advertising cookies or visitor analytics. Account
          settings are saved with your account. Your browser may also store
          information needed to display and navigate the app. You can clear
          cookies and site data in your browser; doing so does not delete your
          account or shared records.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="rights">
        <SubHeading>
          <span id="rights">Your rights and how to use them</span>
        </SubHeading>
        <p>
          Under the GDPR, subject to its conditions, you can request access to
          your personal data and a copy, correction of inaccurate data, erasure,
          restriction of processing, and portability of data you provided where
          processing is automated and based on a contract or consent.
        </p>
        <p>
          <strong>
            You can object to processing based on legitimate interests on
            grounds relating to your particular situation.
          </strong>{" "}
          We will stop that processing unless we demonstrate compelling
          legitimate grounds that override your interests, rights and freedoms,
          or need the data for legal claims.
        </p>
        <p>
          Email{" "}
          <Link to="mailto:tasan@santeri.consulting">
            tasan@santeri.consulting
          </Link>{" "}
          to exercise these rights, including requesting account deletion. We
          may need proportionate information to verify your identity. Requests
          are normally free and answered within one month. If a request is
          complex or there are many requests, we may extend this by up to two
          further months and will explain the extension within the first month.
          If we cannot fulfil a request, we explain why and how you can
          challenge the decision.
        </p>
        <p>
          You may lodge a complaint with the{" "}
          <Link to="https://tietosuoja.fi/en/notification-to-the-data-protection-ombudsman">
            Finnish Data Protection Ombudsman
          </Link>{" "}
          or the supervisory authority in the EEA country where you live, work
          or believe an infringement occurred. You do not have to contact us
          first. You also have the right to seek a judicial remedy.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="changes">
        <SubHeading>
          <span id="changes">Changes to this notice</span>
        </SubHeading>
        <p>
          We keep this notice up to date and show its revision date above. If
          our processing changes in a way that requires new information, we will
          provide it before the change takes effect and obtain consent where
          required.
        </p>
      </section>
    </article>
  );
}
