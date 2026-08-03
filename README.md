# LeadFlow

리더의 주간 보고를 취합하고 CEO 보고 형식으로 요약하는 표준 Next.js App Router 앱입니다. Vercel은 웹 앱과 API를 함께 실행하고, Firebase는 Authentication과 Firestore를 담당합니다.

## 기술 구성

- Next.js 16 App Router / React 19
- Vercel Node.js Route Handlers
- Firebase Authentication / Firestore REST API
- Gemini 3.1 Flash-Lite
- Tailwind CSS 4 + 커스텀 CSS

Cloudflare Worker, vinext, Vite, Firebase Functions 의존성은 사용하지 않습니다.

## 로컬 실행

```bash
npm install
npm run dev
```

검증:

```bash
npm run lint
npm run build
```

## Vercel 환경 변수

`.env.example`의 모든 항목을 Vercel Project Settings > Environment Variables에 등록합니다.

### 브라우저에 노출되는 Firebase 웹 설정

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- `NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL`
- `NEXT_PUBLIC_BOOTSTRAP_ADMIN_UID`

### Vercel 서버에만 저장하는 비밀값

- `GEMINI_API_KEY`

Firebase 서비스 계정 키는 필요하지 않습니다. 신규 계정 발급 API는 로그인한 관리자의 Firebase ID 토큰과 Firestore 권한을 서버에서 다시 검증합니다.

## 최초 관리자 계정

`NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL`과 `NEXT_PUBLIC_BOOTSTRAP_ADMIN_UID`에 등록된 Firebase 계정이 최초 관리자입니다. 이 계정으로 로그인한 후 관리자 화면에서 리더 계정을 발급합니다. 발급된 계정은 첫 로그인 시 비밀번호를 반드시 변경합니다.

## Vercel 배포

Git 저장소를 Vercel에 연결하면 Framework Preset이 Next.js로 자동 인식됩니다. Build Command는 `next build`, Output Directory는 비워 둡니다. 환경 변수를 등록한 후 배포하면 됩니다.

Firestore 보안 규칙은 이미 `leadflow-e3f5b` 프로젝트에 배포되어 있습니다.
