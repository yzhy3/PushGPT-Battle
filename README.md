# PushUp Arena

1v1 fitness esports with Firebase accounts, ranks, leaderboard, training & AI bot.

## Features
- **Firebase Auth** — email/password register & login
- **Profile** — ELO, level, XP, rank, streak, W/L, total reps
- **Leaderboard** — global ranking by ELO
- **1v1 PvP** — Socket.io matchmaking (backend on Render/Railway)
- **Training mode** — solo with MediaPipe camera tracking
- **vs Bot** — easy / medium / hard AI opponent

## Firebase setup (required)

1. Open [Firebase Console](https://console.firebase.google.com/) → project `tiktokperfil-38c8e`
2. **Authentication** → Sign-in method → enable **Email/Password**
3. **Firestore Database** → Create database (production or test mode)
4. Firestore **Rules** (start permissive for testing, then tighten):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /usernames/{name} {
      allow read: if true;
      allow create: if request.auth != null;
    }
  }
}
```

5. Add your Vercel domain under Authentication → Settings → Authorized domains

## Env (Vercel)
- `NEXT_PUBLIC_SOCKET_URL` = your Render/Railway backend URL (for PvP)

## Deploy
- **Frontend**: Vercel (root of this project)
- **Backend**: Render/Railway → root directory `backend`, start `npm start`

## Local
```bash
npm install
npm run dev
# optional PvP:
cd backend && npm install && npm start
```
