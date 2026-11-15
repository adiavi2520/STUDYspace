# StudySpace

A responsive student dashboard built with React, Vite, TypeScript, Tailwind CSS and Supabase. Includes subject dashboards, Physics revision notes, a sample timetable, study resources and a private two-account messaging room inside the **Alternating Current** chapter.

## Requirements

- Node.js 20.19+ (or a compatible current LTS release)
- npm
- A Supabase project

## Run locally

1. Extract the ZIP and open a terminal in the `StudySpace` folder.
2. Install packages:

   ```bash
   npm install
   ```

3. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

   On Windows, copy `.env.example` to `.env` manually.

4. In Supabase, open **Project Settings → API** and copy the Project URL and the anon/publishable key into `.env`:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
   ```

5. Run the development server:

   ```bash
   npm run dev
   ```

   Open the local URL printed by Vite (usually `http://localhost:5173`).

The dashboard and public study notes can be explored before Supabase is configured. The private room requires a configured Supabase project.

## Supabase configuration

1. Create a Supabase project.
2. Open **SQL Editor**, paste the complete contents of `supabase/schema.sql`, and run it.
3. In **Authentication → Providers**, keep Email enabled.
4. In **Authentication → Settings**, turn off public sign-ups. This is important: accounts should be created/invited by the project administrator only.
5. In **Authentication → Users**, create or invite the two intended accounts. Use two different email addresses and secure, unique passwords. Do not share passwords with each other.
6. Copy the UUID for each user from the Users page.
7. In SQL Editor, run the membership insert at the bottom of `supabase/schema.sql`, replacing the two example UUIDs with the real UUIDs:

   ```sql
   insert into public.private_chat_members (user_id) values
   ('FIRST-USER-UUID'),
   ('SECOND-USER-UUID');
   ```

   If the example rows have already been inserted, remove them first or use the real IDs in a clean project. The table has a primary key on `user_id`, so duplicates are rejected.

8. Verify exactly two rows exist:

   ```sql
   select count(*) from public.private_chat_members;
   ```

   The result must be `2`. Do not add a third account. If a member must be replaced, use the SQL editor as the project owner.

9. Add the Project URL and anon/publishable key to `.env`, restart the dev server, and test sign-in from both devices.

### How the private area is protected

- The Alternating Current chapter displays the sign-in screen unless a Supabase session exists.
- The database uses RLS. Authenticated users must be present in `private_chat_members` to read/send chat messages.
- Inserts require the authenticated user to be the sender and the recipient to be the other listed member.
- The photo bucket is private. Storage policies restrict uploads to a member's own UUID folder and reads to authorized members.
- Public account sign-ups are disabled in the setup instructions. Create the two accounts from the Supabase dashboard.
- The frontend contains only the Supabase URL and anon/publishable key. **Never put a service-role key, database password or user password in `.env` or frontend code.**
- Message deletion is limited to the sender's own messages. Photo deletion is limited to the uploader's own storage folder.

### Important deployment security note

The membership table is an administrator-managed allowlist, and client roles cannot modify it. RLS is the security boundary; hiding the chat UI is not security by itself. Keep the SQL policies in place, keep sign-ups disabled, and never expose the Supabase service-role key. The app expects exactly two rows in `private_chat_members`; the send UI checks this too.

## Deploy and share

### Vercel

1. Push the extracted project to a private or public Git repository.
2. Sign in to Vercel and choose **Add New → Project**.
3. Import the repository. Vercel detects Vite automatically.
4. Set build command to `npm run build` and output directory to `dist`.
5. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy. Vercel provides a website URL such as `https://studyspace-yourname.vercel.app`.
7. In Supabase **Authentication → URL Configuration**, set the Site URL to your deployed website URL. Add the production URL and local development URL to Redirect URLs if required.
8. Open the same deployed URL on both phones and sign in using the two separate authorized accounts.

### Netlify

Build command: `npm run build`  
Publish directory: `dist`

Add the same two environment variables in Site configuration → Environment variables, then deploy. Set the deployed URL in Supabase Authentication URL configuration.

## Features

- Responsive navy, white and light-grey student dashboard
- Physics chapters and revision notes
- Chemistry and Mathematics topic cards
- Study timetable and resource ideas
- Private Alternating Current sign-in gate
- Realtime one-to-one text and image messaging
- Message timestamps, sender-side deletion, signed photo URLs and persistent database history
- Supabase RLS and private storage policies

## Notes / limitations

- The timetable is a sample that you can edit in `src/data.ts`.
- Chemistry and Mathematics currently contain topic-organizing cards rather than full chapter notes.
- The private chat is intentionally limited to the two administrator-authorized account IDs. It is not an anonymous public chat.
- This project does not include email/password account creation in the UI. The administrator creates the two users in Supabase.
- Supabase Realtime requires the `private_messages` table to be included in the `supabase_realtime` publication; the SQL script attempts to add it.
- Signed photo URLs expire after one hour and are refreshed when the chat loads.

## Project structure

```text
StudySpace/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig*.json
├── tailwind.config.js
├── postcss.config.js
├── .env.example
├── src/
│   ├── App.tsx
│   ├── data.ts
│   ├── index.css
│   ├── main.tsx
│   └── lib/supabase.ts
└── supabase/
    └── schema.sql
```
