# Installation Guide

Complete compilation and installation instructions for the Recipe Management Application.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Dependencies](#dependencies)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Running the Application](#running-the-application)
- [Building for Production](#building-for-production)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Minimum Version | Recommended Version | Verification Command |
|----------|----------------|---------------------|---------------------|
| **Node.js** | 18.x | 20.x or later | `node --version` |
| **npm** | 9.x | 10.x or later | `npm --version` |

**Alternative Package Managers (Optional):**
- **pnpm**: 8.x or later
- **yarn**: 1.22.x or later
- **bun**: 1.x or later

### System Requirements

- **Operating System**: macOS, Linux, or Windows
- **RAM**: Minimum 4GB (8GB recommended for development)
- **Disk Space**: At least 500MB for dependencies

---

## Dependencies

### Production Dependencies

```json
{
  "next": "16.1.6",
  "react": "19.2.3",
  "react-dom": "19.2.3"
}
```

| Package | Version | Purpose |
|---------|---------|---------|
| **next** | 16.1.6 | React framework with Server-Side Rendering, routing, and API routes |
| **react** | 19.2.3 | Core React library for building UI components |
| **react-dom** | 19.2.3 | React DOM rendering for web applications |

### Development Dependencies

```json
{
  "@tailwindcss/postcss": "^4",
  "@types/node": "^20",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "eslint": "^9",
  "eslint-config-next": "16.1.6",
  "tailwindcss": "^4",
  "typescript": "^5"
}
```

| Package | Version | Purpose |
|---------|---------|---------|
| **@tailwindcss/postcss** | ^4 | PostCSS plugin for Tailwind CSS |
| **@types/node** | ^20 | TypeScript type definitions for Node.js |
| **@types/react** | ^19 | TypeScript type definitions for React |
| **@types/react-dom** | ^19 | TypeScript type definitions for React DOM |
| **eslint** | ^9 | JavaScript/TypeScript linter for code quality |
| **eslint-config-next** | 16.1.6 | ESLint configuration for Next.js projects |
| **tailwindcss** | ^4 | Utility-first CSS framework |
| **typescript** | ^5 | TypeScript compiler and language support |

---

## Installation

### Step 1: Clone the Repository

```bash
cd /path/to/class-project/Source-Code
```

### Step 2: Install Dependencies

Choose your preferred package manager:

#### Using npm (Default)

```bash
npm install
```

#### Using pnpm (Faster, More Efficient)

```bash
pnpm install
```

#### Using yarn

```bash
yarn install
```

#### Using bun (Fastest)

```bash
bun install
```

**Expected Output:**
```
added XXX packages in XXs
```

### Step 3: Verify Installation

Check that dependencies were installed correctly:

```bash
# Verify node_modules exists
ls -la node_modules

# Check Next.js installation
npx next --version
```

**Expected Output:**
```
16.1.6
```

---

## Environment Setup

### Configuration Files

This application requires a Postgres database for recipes. Auth (users,
sessions, password reset tokens) is still in-memory in this phase and
needs no configuration.

#### Database setup (Supabase)

> **Already on Phase 1?** Run `Source_Code/supabase/migrations/2026-04-27-phase-2-auth.sql` in the SQL Editor instead of `schema.sql`. The migration adds the auth tables without re-creating the `recipes` table (though it does truncate it — see the file's header comment).

1. Create a free Supabase project at https://supabase.com.
2. In your project dashboard: **SQL Editor → New query**, paste the
   contents of `Source_Code/supabase/schema.sql`, and run it.
3. Get your connection string: **Project Settings → Database → Connection
   string → URI**. Copy the **Session** pooler URI (recommended for
   Vercel deployments) or the direct URI (for local dev).
4. Copy `Source_Code/.env.local.example` to `Source_Code/.env.local` and
   fill in `DATABASE_URL`.
5. Seed the dev user:

   ```bash
   cd Source_Code
   npm run db:seed
   ```

   The seed script is idempotent — you can run it repeatedly without
   creating duplicate users.
6. Verify the connection:

   ```bash
   cd Source_Code
   npm run dev
   ```

   Then sign in (test@test.com / test) and create a recipe. Restart
   `npm run dev` — the recipe should still be there.

#### Mock User Credentials

- Email: `test@test.com`
- Password: `test`

Created by `npm run db:seed`.

#### Session Duration

- 24 hours
- Authentication: PBKDF2 with SHA-512 (120,000 iterations)

### Optional Environment Variables

If you need to customize the application, create a `.env.local` file:

```bash
# .env.local (Optional)

# Application
NODE_ENV=development

# Server Configuration
PORT=3000
HOST=localhost

# Optional: Custom configuration
# Add any custom environment variables here
```

**Note:** The `.env.local` file is already in `.gitignore` and will not be committed to version control.

### TypeScript Configuration

The project uses strict TypeScript configuration. Verify `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Path aliases allow you to import modules using `@/` instead of relative paths:

```typescript
// Instead of: import { Component } from '../../components/Component'
import { Component } from '@/components/Component'
```

---

## Running the Application

### Development Mode

Start the development server with hot-reloading:

```bash
npm run dev
```

**Expected Output:**

```
  ▲ Next.js 16.1.6
  - Local:        http://localhost:3000
  - Network:      http://192.168.x.x:3000

 ✓ Ready in XXXms
```

**Access the Application:**

Open your browser and navigate to:
- **Local:** [http://localhost:3000](http://localhost:3000)
- **Network:** Use the network URL to access from other devices on the same network

### Available Routes

| Route | Description | Authentication Required |
|-------|-------------|------------------------|
| `/` | Dashboard with recipe grid | Yes |
| `/login` | User login page | No |
| `/register` | User registration page | No |
| `/recipes/[id]` | Recipe detail page | Yes |
| `/api/auth/login` | Login API endpoint | No |
| `/api/auth/register` | Registration API endpoint | No |
| `/api/auth/logout` | Logout API endpoint | No |
| `/api/auth/me` | Get current user | Yes |

### Testing Authentication

1. **Navigate to the login page:**
   ```
   http://localhost:3000/login
   ```

2. **Login with default credentials:**
   - Email: `test@test.com`
   - Password: `test`

3. **Or create a new account:**
   ```
   http://localhost:3000/register
   ```

### Linting

Run ESLint to check code quality:

```bash
npm run lint
```

**Fix linting issues automatically:**

```bash
npx eslint --fix
```

---

## Building for Production

### Step 1: Create Production Build

```bash
npm run build
```

**Expected Output:**

```
   Creating an optimized production build...
   Compiled successfully

   Route (app)                                Size     First Load JS
   ┌ ○ /                                      XXX kB         XXX kB
   ├ ○ /login                                 XXX kB         XXX kB
   ├ ○ /recipes/[id]                          XXX kB         XXX kB
   └ ○ /register                              XXX kB         XXX kB

   ○  (Static)  prerendered as static content
```

**Build Artifacts:**
- `.next/` - Compiled application output
- `.next/standalone/` - Standalone deployment files (if configured)
- `.next/static/` - Static assets (CSS, JS, images)

### Step 2: Test Production Build Locally

```bash
npm run start
```

This starts the production server on `http://localhost:3000`.

**Performance Checklist:**
- [ ] All pages load without errors
- [ ] Authentication works correctly
- [ ] No console errors in browser DevTools
- [ ] Static assets load properly
- [ ] Recipe data displays correctly

---

## Deployment

### Platform Options

#### 1. Vercel (Recommended)

Vercel is the official hosting platform for Next.js applications.

**Deployment Steps:**

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel
   ```

4. **Deploy to Production:**
   ```bash
   vercel --prod
   ```

**Configuration:**
- Framework Preset: `Next.js`
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`
- Node Version: `20.x`

**Environment Variables:**
Add any custom environment variables in the Vercel dashboard.

#### 2. Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

**Build and Run:**

```bash
# Build Docker image
docker build -t recipe-app .

# Run container
docker run -p 3000:3000 recipe-app
```

#### 3. Traditional Server (Node.js)

**Prerequisites:**
- Node.js 20.x or later installed on server
- PM2 or similar process manager
- Nginx for reverse proxy (recommended)

**Deployment Steps:**

1. **Copy build to server:**
   ```bash
   rsync -av .next/ user@server:/var/www/recipe-app/.next/
   rsync -av public/ user@server:/var/www/recipe-app/public/
   rsync -av package*.json user@server:/var/www/recipe-app/
   ```

2. **Install dependencies on server:**
   ```bash
   ssh user@server
   cd /var/www/recipe-app
   npm ci --production
   ```

3. **Start with PM2:**
   ```bash
   pm2 start npm --name "recipe-app" -- start
   pm2 save
   pm2 startup
   ```

4. **Configure Nginx:**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

#### 4. Static Export (Limited Features)

**Note:** Static export does not support:
- API routes
- Server-side authentication
- Dynamic rendering

For this application with authentication, **static export is NOT recommended**.

### Post-Deployment Checklist

- [ ] Application accessible via domain/URL
- [ ] HTTPS/SSL certificate configured
- [ ] Authentication flows working
- [ ] All routes accessible
- [ ] Error monitoring configured (Sentry, etc.)
- [ ] Performance monitoring enabled
- [ ] Backup strategy in place

---

## Troubleshooting

### Common Issues

#### Issue 1: `Module not found` errors

**Symptom:**
```
Error: Cannot find module 'next'
```

**Solution:**
```bash
# Remove node_modules and lockfile
rm -rf node_modules package-lock.json

# Reinstall dependencies
npm install
```

#### Issue 2: Port 3000 already in use

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev
```

#### Issue 3: TypeScript compilation errors

**Symptom:**
```
Type error: Cannot find module '@/components/...'
```

**Solution:**
```bash
# Verify tsconfig.json paths configuration
cat tsconfig.json | grep -A 5 "paths"

# Restart TypeScript server (in VS Code)
# CMD+Shift+P -> "TypeScript: Restart TS Server"
```

#### Issue 4: Build fails with memory error

**Symptom:**
```
JavaScript heap out of memory
```

**Solution:**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

#### Issue 5: Authentication not working

**Symptom:**
- Login redirects back to login page
- Sessions not persisting

**Solution:**
```bash
# Check if cookies are enabled in browser
# Verify cookie name matches AUTH_SESSION_COOKIE constant
# Clear browser cookies and try again

# Check middleware configuration
cat src/middleware.ts
```

### Getting Help

If you encounter issues not covered here:

1. **Check Next.js Documentation:** [https://nextjs.org/docs](https://nextjs.org/docs)
2. **Review Application Logs:** Check terminal output for error messages
3. **Browser DevTools:** Open Console and Network tabs for client-side errors
4. **GitHub Issues:** Create an issue in the project repository

---

## Additional Resources

### Documentation

- **Next.js Documentation:** [https://nextjs.org/docs](https://nextjs.org/docs)
- **React Documentation:** [https://react.dev](https://react.dev)
- **TypeScript Handbook:** [https://www.typescriptlang.org/docs](https://www.typescriptlang.org/docs)
- **Tailwind CSS Documentation:** [https://tailwindcss.com/docs](https://tailwindcss.com/docs)

### Development Tools

- **VS Code Extensions:**
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - TypeScript and JavaScript Language Features

### Version Information

This installation guide is for:
- **Next.js:** 16.1.6
- **React:** 19.2.3
- **TypeScript:** 5.x
- **Tailwind CSS:** 4.x

Last Updated: 2025-03-06
