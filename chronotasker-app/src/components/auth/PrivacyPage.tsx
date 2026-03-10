export default function PrivacyPage() {
  return (
    <div className="privacy-page">
      <div className="privacy-content">
        <a href="/" className="privacy-back">← Back</a>

        <h1>Privacy Policy</h1>
        <p className="privacy-updated">Last updated: 10 March 2026</p>
        <p>TaskDial is a personal productivity tool. This policy explains what information is collected when you use it, why, and what rights you have over it.</p>

        <h2>Who is responsible for your data</h2>
        <p>TaskDial is operated by Doug Belshaw. For the purposes of the GDPR, Doug Belshaw is the data controller.</p>
        <p>If you have any questions or want to exercise your rights, contact: <a href="mailto:privacy@dynamicskillset.com">privacy@dynamicskillset.com</a></p>

        <h2>What data is collected and why</h2>

        <h3>Account information</h3>
        <p>When you create an account, we store your email address, a bcrypt hash of your password (never the password itself), your account role, and timestamps for when your account was created and last updated.</p>
        <p><em>Legal basis: Performance of a contract.</em></p>

        <h3>Tasks and Pomodoro sessions</h3>
        <p>Task titles, tags, and notes are encrypted on your device before being sent to the server. The encryption key is derived from your password and never leaves your browser. The server stores only ciphertext for these fields and cannot read them. Task metadata (dates, durations, completion status) is stored unencrypted so the server can sync your data across devices.</p>
        <p>Pomodoro session records (start time, duration, type) are stored on the server for sync purposes.</p>
        <p><em>Legal basis: Performance of a contract.</em></p>

        <h3>Settings</h3>
        <p>Your app preferences (colour scheme, day start and end times, and other configuration) are stored so they persist across sessions and devices.</p>
        <p>Calendar feed URLs are stored only in your browser. They are never sent to the server. When you load a calendar, your browser makes the request directly through the server proxy — the URL itself is not retained.</p>
        <p><em>Legal basis: Performance of a contract.</em></p>

        <h3>Security and audit logs</h3>
        <p>We keep a log of authentication and administrative events, including successful and failed login attempts, account creation, session refreshes and logouts, and administrative actions. Each log entry records the action type, a timestamp, and the IP address of the request.</p>
        <p>This data is used to detect abuse and investigate security incidents. IP addresses are not used for any other purpose.</p>
        <p><em>Legal basis: Legitimate interests.</em></p>

        <h3>Invite codes</h3>
        <p>When you are invited to register, a record is kept of which invite code you used and when. This links your account to the person who invited you, for administrative purposes.</p>
        <p><em>Legal basis: Legitimate interests.</em></p>

        <h3>Analytics</h3>
        <p>The app records anonymous events when the "install to home screen" prompt appears and whether it was accepted or dismissed. These events are not linked to any user account.</p>
        <p><em>Legal basis: Legitimate interests.</em></p>

        <h2>What we do not collect</h2>
        <ul>
          <li>We do not use advertising trackers or third-party analytics services.</li>
          <li>We do not share your data with any third party.</li>
          <li>We do not sell your data.</li>
          <li>We do not use your data to train AI models.</li>
          <li>We do not send marketing emails.</li>
        </ul>

        <h2>Where your data is stored</h2>
        <p>All data is stored on a server in the European Union. No data is transferred outside the EU.</p>

        <h2>How long we keep your data</h2>
        <table>
          <thead>
            <tr><th>Data</th><th>Retention</th></tr>
          </thead>
          <tbody>
            <tr><td>Account and task data</td><td>Until you ask for your account to be deleted</td></tr>
            <tr><td>Audit log entries</td><td>12 months from the date your account is deleted, then permanently removed</td></tr>
            <tr><td>Refresh tokens</td><td>30 days from issue, then expired automatically</td></tr>
            <tr><td>Aggregate usage counts (logins, installs)</td><td>Kept indefinitely as aggregate totals; no individual events stored</td></tr>
            <tr><td>Inactive accounts</td><td>Accounts inactive for 24 months receive a notice and are deleted 30 days later if no action is taken</td></tr>
          </tbody>
        </table>
        <p>If your account is deleted, all associated tasks, sessions, settings, and tokens are permanently removed. Audit log entries are anonymised: your user ID and IP address are removed from each entry. The anonymised entries are kept for security record-keeping for up to 12 months from the date of deletion, then permanently deleted.</p>

        <h2>Exporting and importing your data</h2>
        <p>You can download all your data at any time from the Settings panel. The export is a JSON file containing your tasks, Pomodoro session records, and settings — enough to restore your data or use it elsewhere. It does not include your password or internal security data.</p>
        <p>If you use the import tool, you are responsible for ensuring the file contains only your own personal data. Importing other people's personal information without a lawful basis is not permitted.</p>

        <h2>Your rights under the GDPR</h2>
        <p>You have the right to access, correct, delete, export (in JSON format), or restrict the processing of your personal data. To exercise any of these rights, contact <a href="mailto:privacy@dynamicskillset.com">privacy@dynamicskillset.com</a>. We will respond within 30 days.</p>
        <p>You also have the right to lodge a complaint with the supervisory authority in your country. In the UK, this is the <a href="https://ico.org.uk/" target="_blank" rel="noopener noreferrer">Information Commissioner's Office (ICO)</a>.</p>

        <h2>Security</h2>
        <p>Task titles, tags, and notes are encrypted on your device using AES-256-GCM before reaching the server. The key is derived from your password using PBKDF2 and never transmitted. Passwords are hashed using bcrypt and never stored in recoverable form. Authentication tokens are stored in httpOnly cookies and never exposed to JavaScript. All data in transit is encrypted using HTTPS.</p>

        <h2>Changes to this policy</h2>
        <p>If we make significant changes to how we handle your data, we will update this page and change the date at the top. We will not reduce your rights without giving you the opportunity to close your account first.</p>

        <p className="privacy-contact">Questions? Contact <a href="mailto:privacy@dynamicskillset.com">privacy@dynamicskillset.com</a></p>
      </div>
    </div>
  );
}
