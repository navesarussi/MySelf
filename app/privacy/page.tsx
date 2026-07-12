export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-10 text-sm leading-relaxed">
      <h1 className="text-xl font-bold">Privacy Policy — מרכז השליטה</h1>
      <p className="text-muted">Last updated: July 2026</p>

      <section className="space-y-2">
        <h2 className="font-semibold">What this app is</h2>
        <p>
          MySelf (מרכז השליטה) is a private personal dashboard for a single user. It is not a
          public service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Google Sign-In &amp; Calendar</h2>
        <p>
          When you sign in with Google, we request access to your email, profile, and read-only
          calendar data. We use this only to authenticate you and sync calendar events into your
          personal timeline.
        </p>
        <p>
          OAuth tokens are stored securely in our database. We do not sell or share your data with
          third parties.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Data storage</h2>
        <p>
          Your dashboard data (timeline, habits, tasks, relationships, etc.) is stored in Supabase
          under a dedicated schema. Only the site owner has access.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Contact</h2>
        <p>
          Questions:{" "}
          <a href="mailto:navesarussi@gmail.com" className="text-accent underline">
            navesarussi@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
