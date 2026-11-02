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
            <strong>Account information:</strong> your email address, name,
            account identifiers, account creation time and saved account
            settings, currently including your locale preference. Our sign-in
            provider, Amazon Cognito, also handles your password and email
            verification information.
          </li>
          <li>
            <strong>Shared records:</strong> split names, membership, expense
            and repayment descriptions, amounts, currencies, exchange rates,
            payers, participants and their shares. We keep creation, edit and
            deletion timestamps and the identifiers of the people making those
            changes, including earlier expense revisions.
          </li>
          <li>
            <strong>Sign-in and invitation information:</strong> session
            identifiers, authentication tokens and security checks, sign-in
            redirects, and invitations with their creator, split and expiry.
          </li>
          <li>
            <strong>Technical information:</strong> our hosting services process
            your IP address, browser and request information to deliver and
            protect the service. Application logs and performance traces can
            include user and record identifiers, request paths, timings, actions
            and error details.
          </li>
          <li>
            <strong>Messages and optional error reports:</strong> what you send
            us by email, or through the error report button. An error report
            contains your description, error message and stack trace, page route
            and app version, and is logged with your account identifier.
          </li>
        </ul>
        <p>
          You provide account details, preferences and records directly. Other
          members of your splits can enter expenses and repayments involving
          you. Account details also come from Cognito, and technical information
          is generated when you use the service. Please avoid including
          sensitive information, such as health details, in descriptions or
          reports.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="purposes">
        <SubHeading>
          <span id="purposes">Why we use data and our legal bases</span>
        </SubHeading>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Providing Tasan (GDPR Article 6(1)(b)):</strong> creating
            and authenticating your account, saving preferences, managing splits
            and invitations, recording expenses and repayments, converting
            currencies and calculating balances are necessary to provide the
            service you request.
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
          details are needed to use an account; membership, amounts and shares
          are needed for shared balance calculations. Without them we cannot
          provide those features. Error reports and contacting support are
          optional. We do not rely on consent for the processing described here;
          choosing to send a report is voluntary.
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
          Exchange rates are requested from Frankfurter by our server using
          currency codes; account and expense details are not sent with those
          requests. Following a GitHub link takes you to a separate service
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
          Tasan runs on AWS in Frankfurt, Germany, and Singapore. Application
          data, including account records, sessions and shared expenses, is
          replicated to Singapore, outside the European Economic Area (EEA).
          Authentication is hosted in Frankfurt. AWS CloudFront and edge
          functions deliver and route requests through locations worldwide, so
          request data may also be processed outside the EEA, including in the
          United States.
        </p>
        <p>
          We may expand hosting and replication to additional AWS regions,
          including US East (Ohio), United States. Ohio is a possible future
          location, not a current database replica. Before personal data is
          replicated to a new region, we will update this notice to identify the
          location and applicable transfer safeguards.
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
          The app’s session cookie lasts up to 14 days after it is set or
          renewed. Signing out deletes the app session. Invitations expire after
          five days; expired session and invitation records are removed
          asynchronously by the database. Frankfurt application logs, including
          submitted error reports, expire after 13 months. Other regional and
          edge logs currently have no configured automatic expiry; their
          retention is assessed based on incident investigation, security and
          troubleshooting needs. Support correspondence is kept for handling
          your request and any related follow-up or dispute, then deleted when
          no longer needed.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="cookies">
        <SubHeading>
          <span id="cookies">Cookies and browser storage</span>
        </SubHeading>
        <p>
          Tasan uses the first-party <code>__session</code> cookie to remember
          your session and secure sign-in. It contains a signed session
          identifier; authentication tokens are stored on the server. The
          auth.tasan.app sign-in service also uses cookies for authentication
          and protection against forged requests. These are necessary to provide
          sign-in and do not require cookie consent. Blocking them prevents
          sign-in from working.
        </p>
        <p>
          We do not use advertising cookies or visitor analytics. Account
          settings, such as your locale preference, are saved with your account.
          Your browser may also keep cached app assets and page scroll
          positions. You can clear cookies and site data in your browser; doing
          so does not delete your account or shared records.
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
          We update this notice when our data handling changes and show the date
          above. If we intend to use your data for a new purpose, we will
          provide information about it before that processing begins and obtain
          consent where required.
        </p>
      </section>
    </article>
  );
}
