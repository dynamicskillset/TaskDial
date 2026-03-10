# Privacy Policy

**Last updated:** 10 March 2026

ChronoTasker is a personal productivity tool. This policy explains what information is collected when you use it, why, and what rights you have over it.

---

## Who is responsible for your data

ChronoTasker is operated by Doug Belshaw (doug@dynamicskillset.com). For the purposes of the GDPR, Doug Belshaw is the data controller.

If you have any questions or want to exercise your rights, contact: **doug@dynamicskillset.com**

---

## What data is collected and why

### Account information

When you create an account, we store:

- Your **email address** — used to identify your account and for you to log in
- A **bcrypt hash** of your password — we never store your password in readable form
- Your **account role** (standard user or owner)
- **Timestamps** for when your account was created and last updated

**Legal basis:** Performance of a contract. Without an account, you cannot use the service.

---

### Tasks and Pomodoro sessions

Your tasks (titles, notes, tags, dates, times) and Pomodoro session records (start and end times) are stored on the server so that your data syncs across your devices.

Task titles and notes may contain personal information — that is your choice. We do not read or analyse the content of your tasks.

**Legal basis:** Performance of a contract.

---

### Settings

Your app preferences (colour scheme, day start and end times, calendar feed URLs, and other configuration) are stored so they persist across sessions and devices.

**Calendar feeds:** If you connect a calendar, the URL you provide is stored in your settings. The server fetches that URL on your behalf to display events in the app. The calendar content is not stored — it is fetched fresh each time and returned directly to your browser.

**Legal basis:** Performance of a contract.

---

### Security and audit logs

We keep a log of authentication and administrative events, including:

- Successful and failed login attempts
- Account creation
- Session refreshes and logouts
- Administrative actions (account changes, invite code creation and revocation)

Each log entry records the **action type**, a **timestamp**, and the **IP address** of the request. Failed login attempts also record the email address that was tried.

This data is used to detect abuse, investigate security incidents, and maintain accountability for administrative actions.

**Legal basis:** Legitimate interests — keeping the service secure and maintaining an audit trail for administrative actions.

IP addresses are personal data under the GDPR. They are not used for any purpose other than security.

---

### Invite codes

When you are invited to register, a record is kept of which invite code you used and when. This links your account to the person who invited you, for administrative purposes.

**Legal basis:** Legitimate interests — controlling who has access to the service.

---

### Analytics

The app records anonymous events when the "install to home screen" prompt appears and whether it was accepted or dismissed. These events are not linked to any user account.

**Legal basis:** Legitimate interests — understanding how the app is used.

---

## What we do not collect

- We do not use advertising trackers or third-party analytics services.
- We do not share your data with any third party.
- We do not sell your data.
- We do not use your data to train AI models.
- We do not send marketing emails.

---

## Where your data is stored

All data is stored on a server in the European Union. No data is transferred outside the EU.

---

## How long we keep your data

| Data | Retention |
|------|-----------|
| Account and task data | Until you ask for your account to be deleted |
| Audit log entries | 12 months, then deleted |
| Refresh tokens | 30 days from issue, then expired automatically |
| Anonymous analytics events | 12 months, then deleted |

If your account is deleted, all associated tasks, sessions, settings, and tokens are permanently removed. Audit log entries linked to your account have the link removed (the entry is kept for security record-keeping but is no longer associated with you).

---

## Your rights under the GDPR

You have the right to:

- **Access** the personal data we hold about you
- **Correct** inaccurate data
- **Delete** your account and all associated data ("right to be forgotten")
- **Export** your data in a portable format
- **Restrict** processing of your data in certain circumstances
- **Object** to processing based on legitimate interests

To exercise any of these rights, contact **doug@dynamicskillset.com**. We will respond within 30 days.

You also have the right to lodge a complaint with the supervisory authority in your country. In the UK, this is the [Information Commissioner's Office (ICO)](https://ico.org.uk/).

---

## Security

Passwords are hashed using bcrypt. Authentication tokens are stored in httpOnly cookies and never exposed to JavaScript. All data in transit is encrypted using HTTPS.

---

## Changes to this policy

If we make significant changes to how we handle your data, we will update this page and change the date at the top. We will not reduce your rights without giving you the opportunity to close your account first.

---

*Questions? Contact doug@dynamicskillset.com*
