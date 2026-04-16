# Notovo

AI-assisted notes and document builder for the browser. Notovo lets you chat to generate content, edit any selected text with AI, keep a versioned history of your document, and pick up where you left off thanks to lightweight session storage.

If you prefer a quick mental model: open the app, describe what you need, and Notovo produces a structured Markdown document you can refine in place. Sessions (and optionally your login) keep your work and chat history organized.

---

## Overview

Notovo is a Next.js app that blends a chat interface with a markdown-first editor:
- Turn prompts or uploaded files into clean, readable notes (with math/KaTeX and code fences).
- Select any text in the document and ask the assistant to rewrite, expand, or refine it.
- Automatically save versions so you can revisit earlier drafts.
- Persist chat messages, uploaded files, and generated content per session; optionally sign in via Supabase Auth to keep a personal session list.

Why it exists: capturing ideas quickly is easy; structuring them is not. Notovo aims to shorten the path from a rough prompt or file to a solid, readable set of notes you can iterate on.

## Key Features

- Chat-driven document creation
  - Use the chat to generate new content blocks and augment your notes. The UI differentiates between simple chat replies and edits/additions that update the document.

- In-place AI editing of selections
  - Highlight any text in your notes and ask the assistant to rewrite, expand, translate, or otherwise improve it. Edits affect only the selected region and create a new version.

- Version history and restore
  - Each significant change can be saved as a version. Browse previous versions and switch back when needed. Version metadata is stored per session.

- File upload pipeline (Markdown-first)
  - Uploads are persisted with a short TTL for anonymous users and a longer TTL for logged-in users. The app depends on Markdown rendering with `react-markdown`, `remark-gfm`, and `rehype-katex` for math blocks.
  - Packages such as `mammoth`, `pdf-parse`/`pdf2json` are present to support ingesting `.docx`/PDF content. Where not yet fully wired, the code is staged for integration via the chat/document flows.

- Responsive, distraction-minimized UI
  - Custom sidebar that collapses/expands on hover (desktop) and an animated mobile drawer. A concise onboarding modal highlights the core workflow on first visit.

- Supabase-backed sessions and auth
  - Anonymous sessions: stored in `localStorage` and automatically expired after inactivity.
  - Authenticated users: sign in with Supabase; see and reopen your chat sessions in the sidebar.

- Markdown + KaTeX renderer
  - Documents render with GFM features (tables, lists, task items) and KaTeX for inline/block math.

## How It Works (Architecture)

- App shell
  - `app/layout.tsx` registers global fonts and wraps the tree in `AuthProvider` for Supabase Auth. Optional analytics are loaded here.

- State and data flow
  - Session ID: generated and kept in `localStorage` (`lib/storage.ts`).
  - Chat: `hooks/useChatStorage.ts` loads/stores messages to Supabase via `lib/storage.ts` using the current session ID. It lazily creates a DB session on the first message.
  - Document: `hooks/useDocumentStorage.ts` tracks an array of simple blocks (`{ id, type: 'paragraph', content }`) and auto-saves them. Versioning helpers in `lib/storage.ts` persist and retrieve versions.
  - UI state: `hooks/useUIState.tsx` tracks modes (`chat` vs `document`), current selection, and flags like `hasDocument` and `isProcessingIntent`.
  - Intent routing: `lib/intentTypes.ts` does a quick local classification (selection/file implies edit/create) and can call an API route (`/api/intent`) for ambiguous messages.

- Rendering and interaction
  - `components/MainContent.tsx` orchestrates the split-pane layout: document on one side, chat on the other; manages version dropdown and mobile tabs.
  - `components/DocRender.tsx` renders Markdown with math/code, tracks selections, and emits selection ranges for targeted edits.
  - `components/ChatSection.tsx` manages file attachments, message streaming UX, and calling storage helpers to persist chat and files.
  - `components/SideBar.tsx` and `components/ui/sidebar.tsx` implement the desktop hover sidebar and mobile drawer, with a user menu and session list for authenticated users.

- Persistence
  - `lib/supabase.ts` defines lightweight TypeScript types for `chat_sessions`, `chat_messages`, `generated_documents`, `user_documents`, and `document_versions`, and creates the Supabase client using environment variables.
  - `lib/storage.ts` wraps reads/writes and handles table-missing scenarios gracefully (logs a friendly setup hint instead of crashing the app).

Assumption: the LLM backend (for generating content and advanced intent classification) lives in API routes or services not shown in this repository snapshot. The UI and storage layers are present and ready to connect.

## Tech Stack

- Framework: Next.js 16 (App Router)
- UI: React 19, Tailwind CSS v4, Framer Motion
- Rendering: `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`
- Icons: Lucide, Tabler Icons
- State: Custom React hooks (`useUIState`, `useChatStorage`, `useDocumentStorage`)
- Data & Auth: Supabase (JS client)
- Parsing (planned/partial): `mammoth` (DOCX), `pdf-parse` / `pdf2json`
- Analytics (optional): Vercel Analytics, Vercel Speed Insights, and a simple script tag in `layout.tsx`

## Installation

1. Prerequisites
   - Node.js 20+
   - A Supabase project (free tier is fine)

2. Clone and install
   ```bash
   npm install
   ```

3. Environment variables
   Create `.env.local` in the project root with:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Supabase tables
   Create the following tables in your Supabase database (names must match):
   - `chat_sessions` — columns: `id uuid primary key`, `user_id uuid null`, `title text null`, timestamps
   - `chat_messages` — columns: `id uuid pk`, `session_id uuid fk -> chat_sessions.id`, `role text`, `content text`, `show_open_document boolean default false`, `version_index int null`, `file_metadata jsonb null`, `edit_metadata jsonb null`, timestamps
   - `generated_documents` — columns: `id uuid pk`, `session_id uuid fk`, `blocks jsonb`, timestamps
   - `user_documents` — columns: `id uuid pk`, `session_id uuid fk`, `user_id uuid null`, `file_name text`, `file_content text`, `file_type text null`, `file_size int8 null`, `expires_at timestamptz`, `created_at timestamptz`
   - `document_versions` — columns: `id uuid pk`, `session_id uuid fk`, `version_index int`, `blocks jsonb`, `content_hash text`, `created_at timestamptz`

   Note: `lib/storage.ts` will log a helpful message if tables are missing, but the app won’t be fully functional until you add them.

5. Run the app
   ```bash
   npm run dev
   # open http://localhost:3000
   ```

## Usage

- Start a new chat
  - Click “New Chat” in the sidebar. Anonymous sessions are kept in `localStorage` and expire after ~10 minutes of inactivity; authenticated sessions are listed under your account.

- Generate notes
  - Type a topic or question in the chat; when appropriate, responses can be added to the document pane as Markdown blocks.

- Upload and reference files
  - Attach a file in the chat. The metadata is stored with your session and available during the conversation. Content extraction for PDF/DOCX is scaffolded and may require enabling the associated pipeline in the API.

- Edit selections with AI
  - Select any text in the document and issue an edit command (e.g., “rewrite more concisely”); the app applies the edit locally and saves a new version.

- Browse versions
  - Use the version dropdown in the document pane to switch between prior versions or restore one.

## Project Structure

- `app/`
  - `layout.tsx` — global providers (Auth), fonts, analytics
  - `page.tsx` — mounts the info carousel and the main sidebar-driven layout
  - `globals.css` — Tailwind v4 styles and custom split-pane handle styling
- `components/`
  - `SideBar.tsx`, `components/ui/sidebar.tsx` — responsive sidebar (desktop hover + mobile drawer)
  - `MainContent.tsx` — split-pane that hosts `DocRender` and `ChatSection`
  - `DocRender.tsx` — Markdown + KaTeX renderer with selection tracking
  - `ChatSection.tsx` — chat UI, attachments, message persistence
  - `InfoCarousel.tsx` — first-run tips modal
  - `UserMenu.tsx` — avatar/login/logout menu
- `hooks/`
  - `AuthContext.tsx` — Supabase Auth provider
  - `useUIState.tsx` — UI mode/selection management
  - `useChatStorage.ts`, `useDocumentStorage.ts` — persistence hooks
- `lib/`
  - `supabase.ts` — types and client setup (reads env vars)
  - `storage.ts` — CRUD helpers for sessions, messages, documents, versions
  - `intentTypes.ts` — local + AI-backed intent classification helpers
  - `utils.ts` — small utilities (e.g., `cn`)
- `public/` — static assets such as `logo.svg`, `mascot.svg`

## Configuration

- Environment variables
  - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be set.

- Optional analytics
  - `app/layout.tsx` includes Vercel Analytics and Speed Insights. There’s also an example `<Script>` tag for a self-hosted analytics endpoint. Remove or update it for your deployment.

- Images
  - `next.config.ts` allows remote images from Google (for Google OAuth avatars).

## Limitations / Known Issues

- LLM/intent API endpoints are not included in this snapshot
  - The UI and storage are wired; you’ll need to implement or connect API routes for generating content and advanced intent detection.

- Supabase schema is required
  - Without the tables listed above, persistence features will no-op with console warnings.

- Large PDF/DOCX parsing in-browser can be slow
  - Consider offloading heavy parsing to serverless functions for better performance and reliability.

- Anonymous session timeout
  - Anonymous sessions clear after ~10 minutes of inactivity; users may lose local state if they idle too long without logging in.

## Future Improvements

- Real-time collaboration and presence
- Side-by-side diffing between versions
- Better file ingestion (server-side extraction, citations, chunking)
- Granular block types (headings, lists, code blocks) instead of only `paragraph`
- Export to PDF/DOCX and shareable links
- Comprehensive test suite and CI

## Contributing

Contributions are welcome.

- Fork the repo and create a feature branch.
- Keep changes focused; include a brief description and screenshots/GIFs when UI-related.
- Ensure `npm run lint` passes.
- Open a pull request and describe the motivation and approach.

## License

Unless stated otherwise by the repository owner, treat this as a private/experimental project. If you plan to open-source it, add a proper license file and update this section.
