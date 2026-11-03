# Security Policy

## Supported versions

Tasan is currently under active development and does not yet publish versioned releases. Security fixes are applied to the latest revision of the default branch. Older commits and deployments are not supported.

## Sessions

Authenticated sessions have a seven-day inactivity window. Requests to routes that load the session refresh both the stored deadline and browser cookie, at most once per hour, up to an absolute limit of thirty days after sign-in. The hourly refresh interval means the inactivity window can be up to one hour shorter than seven days. After either limit, the user must sign in again. Existing sessions without an absolute deadline retain their original expiry and cannot be extended past it.

The backend enforces both deadlines independently of browser cookies and DynamoDB's asynchronous TTL cleanup. Renewal only updates an existing, unexpired session and cannot recreate a session deleted by logout. Sign-in rotates the session ID; anonymous sign-in state expires after ten minutes and is not renewed by activity.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository when it is available. Otherwise, email `santeri@santeri.consulting` with:

- the affected component and revision;
- steps to reproduce or a proof of concept;
- the potential impact; and
- any suggested mitigation.

Do not include real user data or access production systems while investigating. You can expect an acknowledgement within seven days. The maintainer will coordinate validation, remediation, and disclosure with the reporter. Please allow a reasonable remediation period before public disclosure.
