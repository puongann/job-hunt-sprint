# Job Hunt Sprint

A real-time classroom grammar game. Students write sentences on their phones, the teacher corrects them live in red on the projector, the class votes REJECTED / MAYBE / HIRED, the teacher scores, and two teams compete.

The seeded rounds practise **comparatives and superlatives** on the theme **Jobs and Work**. You can add your own topics and grammar points in the round editor. The game name and tagline live in one place: [`src/config/brand.ts`](src/config/brand.ts).

- **Main screen** (laptop on the projector): `/main`. You run the game from here. There is no teacher login.
- **Student phones**: `/` (join), `/play/:roomId`, `/rejoin/:roomId`.
- **Demo**: `/demo`. A 2-3 minute walkthrough that runs fully offline, with no Firebase.

Stack: Vite + React + TypeScript, Tailwind, Framer Motion, Firebase (Anonymous Auth + Firestore + Hosting). No Cloud Functions, so it works on the free **Spark** plan.

---

## 1. Firebase setup (one time, about 10 minutes)

You already have a Firebase project. In the [Firebase console](https://console.firebase.google.com):

1. **Turn on Anonymous sign-in, and only that.**
   *Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.*
   Leave every other provider (Google, Email, ...) **disabled**.
2. **Create the Firestore database.**
   *Build → Firestore Database → Create database →* pick a location close to Vietnam (for example `asia-southeast1`) → start in **production mode**. Our security rules replace the default ones when you deploy.
3. **Register a web app and copy its config.**
   *Project settings (gear icon) → General → Your apps → Add app → Web (`</>`)*. Give it any name. You do not need Firebase Hosting setup here. Copy the values from the `firebaseConfig` snippet.
4. **Create `.env.local`** in this folder (it is git-ignored, so keys are never committed):

   ```bash
   cp .env.example .env.local
   ```

   Fill it in:

   ```
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
   VITE_USE_EMULATOR=false
   ```

5. **Tell the Firebase CLI which project to use.**

   ```bash
   cp .firebaserc.example .firebaserc
   ```

   Then replace `your-firebase-project-id` with your project ID.
6. **Log in and deploy** the rules and the website:

   ```bash
   npx firebase login
   ```

   ```bash
   npm run deploy
   ```

   This builds the app and deploys **Hosting + Firestore rules + indexes**. The CLI prints your URL, for example `https://your-project.web.app`.

The web API key in `.env.local` is not a secret in the usual sense: every visitor's browser receives it. What protects the data is `firestore.rules`.

## 1b. GitHub + automatic deploy

The code lives on GitHub. **Every push to `main` is checked and deployed automatically** by GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)): typecheck, lint, unit tests, rules tests, build, then `firebase deploy` (Hosting + Firestore rules + indexes). Pull requests get a temporary **preview link** ([.github/workflows/preview.yml](.github/workflows/preview.yml)); previews share the live database.

GitHub needs only **one secret** (repo → *Settings → Secrets and variables → Actions → New repository secret*):

| Secret name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | the **whole content** of a service account key JSON file (below). The project ID is read from it. |

The web config (API key, auth domain...) is read automatically from Firebase Hosting (`https://<project-id>.web.app/__/firebase/init.json`), see [scripts/ci-firebase-config.sh](scripts/ci-firebase-config.sh). The `VITE_FIREBASE_*` secrets are only a fallback for the very first deploy if that fails; values pasted with quotes or `apiKey:` in front are cleaned.

**Service account key** (lets GitHub deploy for you):
1. Firebase console → ⚙ *Project settings → Service accounts → Generate new private key → Generate key*. A `.json` file downloads.
2. Open it in a text editor, select all, copy, and paste it as the value of `FIREBASE_SERVICE_ACCOUNT`.
3. **Delete the downloaded file** afterwards. It is a password for your project: never commit it or send it to anyone.
4. Give that account permission to deploy: open https://console.cloud.google.com/iam-admin/iam (pick your project), find the row `firebase-adminsdk-…@….iam.gserviceaccount.com`, click the ✏️ pencil, **Add another role** → `Firebase Admin`, and again → `API Keys Viewer` → **Save**.

Then run the deploy: repo → *Actions → Deploy to Firebase → Run workflow* (or just push to `main`). The live URL is `https://<project-id>.web.app`.

## 2. Development

You need Node 20 or newer (`nvm use` reads `.nvmrc`), and Java 11+ for the emulators.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` talks to your real Firebase project (from `.env.local`).

**Rehearse with no Firebase project at all** by running the local emulators in two terminals:

```bash
npm run dev:emu
```

```bash
npm run dev:local
```

Then open `http://localhost:5173/main`. Students on the same Wi-Fi can join through your laptop's LAN address (Vite prints it).

**Simulate class (dev only):** in the control dock, *Simulate class → Add 15 bot students*. Each bot has its own anonymous login, so the security rules apply to bots exactly as to phones. Bots join (Join must be open), write during rounds, and vote during voting. The button and its code do not exist in production builds.

### Checks

```bash
npm run check
```

This runs, in order: `typecheck`, `lint`, unit tests (`npm test`: scoring, diff, review queue, round templates), rules tests in the Firestore emulator (`npm run test:rules`), and the production `build`.

## 3. How it is built

```
firestore.rules              security rules (the referee: self-votes, late sentences, PIN...)
tests/firestore.rules.test.ts  rules tests (@firebase/rules-unit-testing + emulator)
src/
  config/brand.ts            game name + tagline
  lib/
    scoring.ts (+test)       pure scoring: studentAvg, finalScore, team averages, tie-breaks
    diff.ts (+test)          pure word-level diff used by every screen
    queue.ts (+test)         round-robin review order
    rounds.ts (+test)        seeded rounds, templates (localStorage), JSON import/export
    api.ts                   all Firestore writes (host is the single writer of aggregates)
    hooks.ts                 real-time listeners (per room; votes only for the current sentence)
    firebase.ts, clock.ts, sound.ts (Web Audio), fx.ts (confetti, fullscreen), ids.ts, types.ts
  components/                paper cards, stamps, timer, QR, in-place correction editor
  views/Big.tsx              main-screen views (lobby, writing wall, review, leaderboard)
  views/Phone.tsx            phone views (join, waiting, writing, voting, results)
  pages/                     Join, Play, Rejoin, MainLanding, MainRoom (host logic)
  dock/                      control dock, round editor, dev-only class simulator
  demo/DemoPage.tsx          /demo: the same views with scripted data, no Firebase
```

Key ideas:

- **Identity:** a student's identity is a `playerId` (their first anonymous uid). `members/{uid}` maps each login to a `playerId`. All rule checks go through it, so a rejoin keeps the same player and can never create a second identity or a second vote.
- **Host:** `room.hostUid`, or anyone holding a `hostClaims/{uid}` doc. That doc can only be written with the PIN stored in `roomSecrets` (which no client can read).
- **Single writer:** only the main screen writes tallies, averages, final scores and the live vote count.
- **Clock sync:** each client measures its offset from a Firestore server timestamp, so countdowns match. The writing deadline is enforced by the rules (`request.time < timerEndsAt`).
- **Scoring:** `finalScore = 0.5 × studentAvg + 0.5 × teacherScore` (teacher score only if nobody voted). Team score = average over the team's **locked** sentences. ⭐ stars never change scores; ties break on stars, then on the number of locked sentences.

**Cost on the free plan:** students do not listen to the player list during play. Votes are only listened to for the current sentence, and only by the main screen. Heartbeats are one write every 15 s per phone. A 15-student, 12-minute game uses a few thousand reads.

---

## 4. Hướng dẫn nhanh cho giáo viên (Vietnamese quick start)

**Chuẩn bị**
1. Mở laptop nối máy chiếu, vào `https://<dự-án>.web.app/main`.
2. (Nên làm) Bấm **Play demo** để chiếu cho học sinh xem cách chơi trong 2-3 phút. Phím: `Space`/`→` sang bước tiếp, `←` lùi, `A` tự chạy, `Esc` thoát. Cuối demo bấm **Start for real**.

**Tạo phòng**
3. Bấm **Create room**. Màn hình hiện **mã PIN 6 số** (giữ nút để xem, vì máy chiếu có thể đang bật). **Ghi PIN ra giấy**: nếu trình duyệt bị mất dữ liệu, PIN giúp bạn lấy lại màn hình chính.
4. Màn hình lớn hiện **mã phòng 4 chữ** và **mã QR**. Học sinh quét QR (hoặc vào trang web và nhập mã), đặt biệt danh, chọn Team A hoặc B.

**Chơi một vòng**
5. Thanh điều khiển luôn nằm ở đáy màn hình (`F` để toàn màn hình). Hàng trên là thao tác chơi, nút chính luôn ở góc phải; hàng dưới là cài đặt phòng. Chọn vòng rồi bấm **Start round**. Lúc này học sinh mới không vào được nữa ("Join closed").
6. Học sinh viết trên điện thoại. Màn hình lớn hiện số bài nộp, nội dung bị che "CONFIDENTIAL". Có thể **+30 s** hoặc **End now**.
7. Hết giờ, bấm **Start review**.

**Chấm từng câu** (tên học sinh hiện dạng "Candidate Tên"; có thể ẩn trong Settings)
8. **Sửa câu:** bấm vào câu trên màn hình lớn và gõ trực tiếp. Chữ thêm vào hiện **đỏ, đậm**; chữ bị xoá hiện gạch ngang màu xám. Điện thoại học sinh cập nhật ngay. Có nút **Reset correction** và **Hide deletions**.
9. Bấm `N` (hoặc nút **Open voting**): học sinh bỏ phiếu REJECTED / MAYBE / HIRED. Tác giả không được tự bỏ phiếu.
10. Bấm `0`, `1` hoặc `2` để cho điểm (tự đóng bình chọn). Bấm `S` để tặng ⭐ nếu câu dùng đúng cấu trúc "Level up!".
11. Bấm `L` (**Lock and reveal**): hiện kết quả bình chọn, điểm trung bình, điểm cuối = 50% học sinh + 50% giáo viên, rồi tên tác giả.
12. Bấm `N` để sang câu tiếp. Nút ☰ mở danh sách câu (nhảy tới câu bất kỳ); **Skip** để bỏ qua; 📌 để đánh dấu quay lại sau.

**Kết thúc**
13. Chấm xong, bấm **Next round** hoặc **🏆 Leaderboard**. Điểm đội = trung bình các câu đã chấm. Hoà thì đội nhiều ⭐ hơn thắng.

**Khi có sự cố**
- **Học sinh bị thoát / đổi máy:** bấm **Show rejoin QR** (mở 3 phút, có +1 min và Close). Học sinh quét QR, chọn đúng tên mình. Trên thanh điều khiển hiện yêu cầu: nhìn đúng người rồi bấm **Approve**. Học sinh quay lại đúng đội, giữ nguyên câu và phiếu bầu.
- **Trình duyệt máy chính bị mất dữ liệu:** mở `/main` trên trình duyệt khác, phần **Resume room** nhập mã phòng + PIN.
- **Ẩn tên tác giả:** mặc định tên người viết hiện ngay. Muốn giấu đến lúc công bố: **⚙ Settings** → tick **Hide the author**.
- **Sửa nội dung vòng chơi:** nút **⚙ Settings** (hoặc **Settings (rounds)** trước khi tạo phòng). Có **Export / Import JSON** để mang sang máy khác.
- Âm thanh: bấm **Enable sound** một lần; nút 🔊/🔇 để tắt tiếng.
