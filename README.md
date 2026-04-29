# Recipe Management System

A web application for personal recipe organization. Users register, log in,
and manage their own recipes — create (manually or via AI from a description
or photo), edit, search, filter by category, and delete. They can save
recipes into a "bucket" (drag-and-drop on desktop, tap on mobile), then plan
a week of meals (morning / noon / evening per day) by dragging from the
bucket onto day slots, and auto-generate a categorized shopping list with
check-off boxes.

**Live:** [se-project-jade-eight.vercel.app](https://se-project-jade-eight.vercel.app/) (test account: `test@test.com` / `test`)

Built with Next.js 16, React 19, TypeScript, and Tailwind CSS 4. Recipes,
users, sessions, and password reset tokens are all persisted to Postgres
(Supabase). The app holds no user state in process memory.

## Quick start

```bash
cd Source_Code
npm install
# Configure Source_Code/.env.local with DATABASE_URL — see INSTALL.md
npm run db:seed
npm run dev
```

Open http://localhost:3000.

A seeded test account is available: `test@test.com` / `test`.

### Database

This phase requires a Postgres database for recipes. See
[Installation Guide](./%20Deployment_Setup/INSTALL.md#database-setup-supabase)
for the Supabase setup.

## Project layout

- `Source_Code/` — Next.js app
- `Documentation/` — SRS (PDF + DOCX)
- `User_Documentation/` — end-user guide and screenshots
- ` Deployment_Setup/` — install instructions
- `docs/superpowers/plans/` — implementation plans

## Documentation

- [Software Requirements Specification](Documentation/JIASHU_HU_SRS.pdf)
- [Installation Guide](./%20Deployment_Setup/INSTALL.md)
- [User Guide](User_Documentation/USER_GUIDE.md)

## Scripts

Run from `Source_Code/`:

- `npm run dev` — development server with hot reload
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — ESLint
- `npm test` — run unit + integration tests
- `npm run test:cov` — tests with coverage report

## License

MIT — see [LICENSE](LICENSE).
