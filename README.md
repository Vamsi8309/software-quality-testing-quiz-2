# Software Quality & Testing Quiz

A browser-based multiple-choice quiz covering software quality and testing concepts,
with a shared leaderboard backed by Supabase.

Live link: <https://vamsi8309.github.io/software-quality-testing-quiz-2/>

## Repository layout

| Path | Purpose |
| --- | --- |
| `Game1_Software_Quality_Testing/` | The quiz source (edit here) |
| `supabase/schema.sql` | Database tables and functions for the shared leaderboard |
| `serve.js` | Tiny static file server for local testing |
| `gh-pages` branch | The published copy — `index.html`, `script.js`, `style.css` at the root |

## Run locally

From the repository root:

```powershell
node serve.js Game1_Software_Quality_Testing 8791
```

Then open <http://localhost:8791/>.

## Shared leaderboard setup

Scores live in a Supabase (Postgres) database, so every player on every device
writes to the same leaderboard. Without this setup the quiz cannot record scores.

### 1. Create the database

1. Create a free project at <https://supabase.com>.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and run it.
   It is safe to re-run at any time.

### 2. Set the Admin PIN

The PIN is deliberately not stored in this repository, because the repository is
public. Run this separately in the SQL Editor, replacing the placeholder:

```sql
insert into public.app_config (key, value)
values ('admin_pin', 'YOUR_PIN_HERE')
on conflict (key) do update set value = excluded.value;
```

Use something longer than four digits. A 4-digit PIN is only 10,000 guesses, and
the quiz page is public, so a short PIN can be brute-forced by a script.

### 3. Connect the quiz

Copy the **Project URL** and the **anon / public key** from
**Project Settings → API**, then fill them into the config block near the bottom
of `Game1_Software_Quality_Testing/index.html`:

```html
<script>
  window.QUIZ_SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
  window.QUIZ_SUPABASE_ANON_KEY = "eyJhbGci...";
</script>
```

Until these are filled in, the quiz reports that the shared leaderboard is not
connected and refuses to start — it does not silently fall back to per-device
storage.

## Publish

The live site is served from the root of the `gh-pages` branch, so publishing
means copying the three quiz files there:

```powershell
git checkout gh-pages
git checkout main -- Game1_Software_Quality_Testing/index.html Game1_Software_Quality_Testing/script.js Game1_Software_Quality_Testing/style.css
git mv -f Game1_Software_Quality_Testing/index.html index.html
git mv -f Game1_Software_Quality_Testing/script.js script.js
git mv -f Game1_Software_Quality_Testing/style.css style.css
git commit -m "Publish shared leaderboard"
git push origin gh-pages
git checkout main
```

Do not publish before completing the shared leaderboard setup above, or the live
quiz will fail at the Start button.

## Security notes

- The anon key is public by design. `supabase/schema.sql` enables row level
  security with no policies on both tables, so that key cannot read, insert,
  update or delete rows directly. All access goes through five
  `SECURITY DEFINER` functions.
- With the anon key alone a visitor can do exactly three things: check whether an
  Employee ID has already played, submit one score for an Employee ID, and
  attempt a PIN-guarded admin action.
- Scores are derived in the database (`score` is a generated column computed from
  `correct`), so a tampered client cannot post an arbitrary score. The most it
  can claim is 5 correct answers.
- The one-attempt-per-employee rule is enforced by the `employee_id` primary key,
  so it now applies across all devices and browsers rather than per browser
  profile.
- The Admin PIN is checked inside the database, not in the browser. The
  `admin_pin_state` function is revoked from the anon role so the page cannot use
  it as a bare PIN oracle.
