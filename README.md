# Software Quality & Testing Quiz

A browser-based multiple-choice quiz covering software quality and testing concepts.

## Run locally

From the repository root, run:

```powershell
node serve.js Game1_Software_Quality_Testing 8791
```

Then open <http://localhost:8791/>.

## Notes

- Quiz and leaderboard data are stored in the browser's local storage.
- The one-attempt-per-employee rule applies per browser profile.
- The admin view is client-side only and is not a security boundary.
