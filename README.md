# Idea Matrix

Your team's 2x2 startup-idea board. Everyone places the ideas on their
own matrix (Hype vs. Payoff), and the "Everyone" tab merges them —
average positions or all dots side by side.

Hosted on GitHub Pages (the app) + Firebase Realtime Database (the
shared state). Changes sync live to everyone with the link.

## Setup (once, ~5 minutes)

### 1. Put it on GitHub Pages
1. Create a new GitHub repository and upload `index.html`, the `src/`
   and `config/` folders (and this README).
2. In the repo: Settings -> Pages -> Source: "Deploy from a branch",
   branch `main`, folder `/ (root)`. Save.
3. After a minute your app is live at
   `https://<your-username>.github.io/<repo-name>/`

### 2. Create the shared database (Firebase, free)
1. Go to https://console.firebase.google.com -> "Add project"
   (any name, Analytics off is fine).
2. In the project: Build -> Realtime Database -> "Create database"
   -> pick a location -> start in **test mode**.
3. Project settings (gear icon) -> "Your apps" -> Web app (</>) ->
   register it -> copy the `firebaseConfig` object it shows you.

### 3. Connect the two
Open `config/firebase-config.js`, find `FIREBASE_CONFIG`, and paste
your values in, e.g.:

    const FIREBASE_CONFIG = {
      apiKey: "AIza....",
      authDomain: "idea-matrix.firebaseapp.com",
      databaseURL: "https://idea-matrix-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "idea-matrix",
    };

(`databaseURL` is the important one — copy it from the Realtime
Database page if it's not in the snippet.)

Commit, push, send the GitHub Pages link to your friends. Done.

## Run locally

The app uses ES modules, which browsers refuse to load from `file://`
pages — so don't open index.html directly. Serve the folder instead:

    python3 -m http.server 8000

then open http://localhost:8000.

## Notes
- Without the Firebase config the app still works, but nothing is
  saved — use Export JSON to keep a copy. The badge in the header
  tells you which mode you're in.
- Test-mode database rules expire after 30 days and allow anyone who
  knows the URL to read/write. Fine for three friends picking a
  startup; if you want it tighter later, set the rules to require a
  secret in the path or add Firebase Auth.
- Export JSON in the header still works as manual backup.
- `BOARD_ID` in `config/firebase-config.js` names the board — change it to start over
  with a clean slate without deleting anything.
