# 🏛️ Businz Enterprise HRMS — System Architecture & Monorepo Directory Guide

This document establishes the official directory organization, layer boundaries, and coding standards for the Businz Enterprise HRMS application.

---

## 1. Monorepo Overview

The repository is organized into distinct, clean domains with clear separation of concerns:

```
HRM/
├── frontend/               # React 19 + TypeScript + Vite Single Page Application
├── backend/                # Node.js + Express + TypeScript REST API & Database Service
├── deploy/                 # Docker Compose, Nginx, and cloud deployment manifests
├── mobile/                 # Flutter mobile application
├── docs/                   # Architectural guides and historical audit/cleanup reports
├── legacy/                 # Archived prototypes (e.g. initial FastAPI/SQLite backend)
└── package.json            # Root monorepo scripts (concurrent dev, builds, db sync)
```

---

## 2. 🖥️ Frontend Architecture (`/frontend`)

The frontend is a modern single-page application built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**.

### Directory Structure
```
frontend/
├── public/                 # Static assets served untouched at root URL
│   ├── brand-logo.png      # Application brand logo
│   ├── logo-icon.png       # Square icon logo
│   ├── favicon.svg         # Tab favicon
│   ├── .htaccess           # Apache / LiteSpeed SPA rewrite rules
│   └── web.config          # Windows IIS / Plesk rewrite rules
├── src/
│   ├── assets/             # Bundled static images and media
│   ├── components/         # UI components modularized by domain
│   │   ├── attendance/     # Check-in/out, biometric, monthly views, logs
│   │   ├── auth/           # Login form, password resets, onboarding auth
│   │   ├── customer/       # Customer directory, visiting cards, business contacts
│   │   ├── dashboard/      # Executive KPIs, attendance cards, recent activity
│   │   ├── employees/      # Employee directory, 9-step onboarding wizard, profile drawer
│   │   ├── layout/         # Sidebar, Topbar, Company Switcher, AppLayout wrapper
│   │   ├── leave/          # Leave requests, balance badges, approval workflow modal
│   │   ├── payroll/        # Salary structures, advance loans, payslip generation
│   │   ├── performance/    # Reviews, appraisals, goal tracking
│   │   ├── settings/       # Company details, branches, departments, shifts, roles, integrations
│   │   ├── tasks/          # Task boards, assignees, status updates
│   │   ├── ui/             # Reusable UI primitives (Buttons, Modals, Tables, Toast)
│   │   └── whatsapp-crm/   # WhatsApp campaigns, template editor, broadcast logs
│   ├── context/            # React global context providers (HRMSContext.tsx)
│   ├── data/               # Initial state defaults and lookup constants
│   ├── services/           # Client API clients & business engines
│   │   ├── authService.ts
│   │   ├── payrollApi.ts
│   │   ├── customerService.ts
│   │   ├── crmService.ts
│   │   └── attendanceCalculationEngine.ts
│   ├── styles/             # Global CSS and module style sheets
│   │   ├── main.css        # Core design system tokens (Linear/Notion Dark Teal palette)
│   │   └── whatsapp-crm.css
│   ├── types/              # Frontend TypeScript interfaces (hrms.ts, crm.ts, settings.ts)
│   ├── utils/              # Helper utilities (date utils, PDF/Excel export, validation)
│   ├── App.tsx             # Root layout router
│   ├── index.css           # Tailwind entry & base typography
│   └── main.tsx            # DOM root mounting
├── e2e/                    # Playwright end-to-end integration test suites
├── scripts/                # Frontend verification & automated test scripts
│   ├── test_hrms_flow.js   # Flow engine test suite (30 passed tests)
│   └── test_round2_audit.js# Comprehensive regression audit suite (37 passed tests)
├── Dockerfile              # Multi-stage production container build (Nginx)
├── nginx.conf              # Production Nginx reverse proxy configuration
├── vite.config.ts          # Vite bundler configuration & local dev proxy (/api -> :8000)
├── tsconfig.json           # Frontend TypeScript compiler configuration
└── package.json            # Frontend dependencies & npm scripts
```

### What Belongs in Frontend:
- ✅ All user interfaces, React hooks, UI components, styling, and animations.
- ✅ Client-side validation (instant form feedback, sanitization).
- ✅ Reusable client export utilities (PDF payslips, Excel muster rolls).
- ✅ Playwright UI end-to-end test specs (`frontend/e2e/`).
- ❌ **NEVER** put raw database credentials or server secret keys in frontend files.

---

## 3. ⚙️ Backend Architecture (`/backend`)

The backend is an enterprise-grade RESTful API service built with **Node.js**, **Express**, **TypeScript**, and **PostgreSQL**.

### Directory Structure
```
backend/
├── src/
│   ├── config/             # Environment validation (env.ts) and database pool (database.ts)
│   ├── controllers/        # Request handling, response status codes, payload mapping
│   │   ├── authController.ts
│   │   ├── payrollController.ts
│   │   ├── employeeController.ts
│   │   ├── customerController.ts
│   │   ├── crmController.ts
│   │   └── settingsController.ts
│   ├── middleware/         # Auth verification, rate limiting, error handling, Helmet
│   ├── repositories/       # Pure SQL / PostgreSQL data queries and transactions
│   ├── routes/             # Express route endpoints mapped to controllers
│   ├── services/           # Business calculation engines, encryption, email dispatch, WhatsApp
│   ├── types/              # Server-side TypeScript models & payloads
│   ├── utils/              # Cryptographic utilities, JWT tokens, logging
│   ├── validators/         # Zod schemas for input validation & sanitization
│   ├── app.ts              # Express application configuration and middleware chain
│   └── server.ts           # HTTP server listener & graceful shutdown handlers
├── migrations/             # Version-controlled incremental SQL migrations (001_... to 016_...)
├── scripts/                # Database maintenance, sync, seeding, and verification
│   ├── syncDatabase.mjs    # Synchronizes database schema columns
│   ├── seedDatabase.mjs    # Seeds demo & initial enterprise roles/users
│   └── verifySystem.ts     # Health and integrity audit script
├── tests/                  # Vitest unit & integration test suites (*.test.ts)
├── schema.sql              # Authoritative PostgreSQL master schema
├── Dockerfile              # Production Node.js multi-stage Docker build
├── docker-compose.yml      # Local container orchestration
├── tsconfig.json           # Backend TypeScript build configuration
└── package.json            # Backend dependencies, scripts, and overrides
```

### What Belongs in Backend:
- ✅ Secure business logic: salary formulas, tax deductions, attendance policies.
- ✅ Database queries, foreign key cascades, transactions.
- ✅ Third-party secret integration handlers (WhatsApp Cloud API, SMTP email).
- ✅ Input validation via Zod schemas before database insertion.
- ❌ **NEVER** place UI components, JSX, or browser-only APIs in `backend/`.

---

## 4. 🚀 Monorepo Root & Deployment (`/deploy`, root)

- **`package.json`**: Root orchestration scripts:
  - `npm run dev`: Concurrently boots backend on `:8000` and frontend on `:5173`.
  - `npm run build`: Compiles TypeScript for backend (`dist/`) and bundles frontend (`dist/`).
  - `npm start`: Bootstraps production backend (`app.js` -> `backend/dist/server.js`).
- **`app.js` & `server.js`**: CommonJS wrappers for Windows IISNode / Plesk environments.
- **`web.config`**: Configures IIS URL rewrite for React SPA and reverse proxy for `/api/`.
- **`deploy/vps/`**:
  - `docker-compose.yml`: Production orchestration including PostgreSQL 16, PostgREST 12, Nginx rest-proxy, Node.js backend, and Nginx frontend.

---

## 5. 📦 Archived Legacy Code (`/legacy`)

- **`legacy/python-fastapi/`**: Contains the original prototype backend written in Python (FastAPI + SQLAlchemy + SQLite). Preserved for historical reference and algorithm parity checks without cluttering active production code.

---

## 6. 📁 Summary Checklist: Where Does New Code Go?

| File Type | Correct Location |
| :--- | :--- |
| React Component | `frontend/src/components/<module-name>/` |
| React Hook / Context | `frontend/src/context/` or `frontend/src/hooks/` |
| Client CSS / Style | `frontend/src/styles/` |
| Frontend API Call | `frontend/src/services/` |
| Server REST Route | `backend/src/routes/<module>Routes.ts` |
| Server Controller | `backend/src/controllers/<module>Controller.ts` |
| Server Business Logic | `backend/src/services/<module>Service.ts` |
| Database Queries | `backend/src/repositories/<module>Repository.ts` |
| Input Zod Schema | `backend/src/validators/<module>Validators.ts` |
| SQL Migration | `backend/migrations/<number>_<name>.sql` |
| Vitest Test | `backend/tests/<feature>.test.ts` |
| Playwright E2E Test | `frontend/e2e/<feature>.spec.ts` |
| Architecture / Audit Doc | `docs/` or `docs/reports/` |
