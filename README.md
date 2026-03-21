<h1 align="center">Notovo</h1>
<p align="center">
AI-first note workspace — chat to create, edit, version, and export beautiful documents.
</p>

<p align="center">
  <b>Tech</b>: Next.js 14 · TypeScript · Supabase · Framer Motion · React Split Pane · Tailwind-style utilities
</p>

---

## ✨ What Notovo Does
- 💬 **Chat → Docs**: Converse to generate structured notes.
- 🪄 **Smart edits**: Select any text and ask AI to rewrite/expand/refine.
- 🧭 **Version history**: Every save is a version (deduped; keeps latest 10). Browse/restore anytime.
- 🔐 **Auth**: Email/password + Google OAuth via Supabase. Anonymous mode included.
- 📱 **Responsive UX**: Mobile tabbed (Chat/Notes) and desktop split view with fullscreen toggle.
- 📄 **Export**: Download your document as PDF from the toolbar.
- ⏱️ **Sessions**: Local session per user; anonymous sessions auto-expire after 10 min of inactivity.

---

## 🧭 Onboarding (Fast Track)
1) **Sign up / Log in**  
   - Email & password or **Continue with Google**.  
   - Skip login for anonymous mode (auto-expires after 10 minutes idle).

2) **Start a chat**  
   - Click **New Chat** in the sidebar to begin or reset a session.

3) **Create & edit**  
   - Desktop: split view (chat left, doc right) with maximize.  
   - Mobile: toggle tabs (Chat / Notes).  
   - Select text in the doc to open AI editing actions.

4) **Manage versions**  
   - Use the version dropdown or chat version buttons to jump/restore.  
   - Up to 10 latest versions kept; duplicates are skipped.

5) **Export / finish**  
   - Hit **Download PDF** in the doc toolbar to export.

---

## 🔧 Run Locally
```bash
npm install
npm run dev
# visit http://localhost:3000
```

Create `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 🗂️ Key Files
- `app/page.tsx` — entry; renders `InfoCarousel` + `SidebarDemo`.
- `components/InfoCarousel.tsx` — modal with starter tips.
- `components/SideBar.tsx` — sessions, auth-aware nav, anonymous timeout.
- `components/MainContent.tsx` — chat + document UI, versioning, PDF export.
- `hooks/AuthContext.tsx` — Supabase auth (email/password + Google).
- `lib/storage.ts` — session IDs, version save/load (Supabase).

---

## ✅ Feature Checklist
- [x] Email/password auth
- [x] Google OAuth
- [x] Anonymous mode with inactivity timeout
- [x] Chat-driven document creation
- [x] Selection-based AI editing
- [x] Version history (latest 10)
- [x] PDF export
- [x] Responsive layouts (mobile tabs / desktop split & fullscreen)
- [x] "New Chat" session reset

---

<p align="center">Built for fast ideas → polished docs.</p>
