# Comprehensive End-to-End Application Analysis: ApexHRMS

## Executive Summary

**ApexHRMS** is a **client-side single-page application (SPA)** built with **React 19**, **TypeScript**, and **Vite 8**. It is styled using vanilla CSS (with modern CSS custom properties and HSL-tailored dark/light enterprise themes) and Lucide React icons.

The application serves as a comprehensive **Human Resource Management System (HRMS)** prototype / front-end demonstration, featuring 15 interactive functional modules including Employee Directory, Face Recognition Attendance, Daily Attendance Logs & Geofencing, Leave Management, Shift Scheduling, Task & Kanban Management, Performance Tracking, Recruitment Pipeline & Candidate Referrals, Expense Reimbursement, Payroll & Printable Payslips, Organization Hierarchy, Reports & Analytics, Notification Center, and Role-Based Access Control (RBAC) Settings.

**Key Architecture Finding**: **There is NO backend server, NO REST/GraphQL API server, NO database, NO server-side authentication, and NO external cloud integrations.** The application operates 100% in the browser. State management and data persistence are handled completely client-side via a React Context (`HRMSContext`) coupled with browser `localStorage`. Feature functionality such as facial recognition (WebCam stream display), GPS geofencing (simulated CSS coordinate pins), CSV exports, and printable PDF payslips are implemented strictly on the client side.

---

## 1. Current Tech Stack

### Frontend

| Technology | Version / Spec | Where Used | Evidence File / Line |
| :--- | :--- | :--- | :--- |
| **Framework / Library** | React `^19.2.8` | Core UI rendering engine throughout the app | [package.json](file:///c:/Users/ahile/Downloads/H/package.json#L14) |
| **DOM Renderer** | React DOM `^19.2.8` | Mounts root component to DOM `#root` | [package.json](file:///c:/Users/ahile/Downloads/H/package.json#L15), [main.tsx](file:///c:/Users/ahile/Downloads/H/src/main.tsx#L6) |
| **Programming Language** | TypeScript `~6.0.2` | Strong typing, interfaces, enums, permission matrix definitions | [package.json](file:///c:/Users/ahile/Downloads/H/package.json#L23), [tsconfig.json](file:///c:/Users/ahile/Downloads/H/tsconfig.json) |
| **Icon System** | Lucide React `^1.37.0` | UI icons across navigation, buttons, cards, statuses | [package.json](file:///c:/Users/ahile/Downloads/H/package.json#L13), [Sidebar.tsx](file:///c:/Users/ahile/Downloads/H/src/components/layout/Sidebar.tsx#L4-L21) |
| **CSS / Styling Approach** | Vanilla CSS (CSS Modules / Global Theme Variables) | Theme tokens (`:root`), layouts, glassmorphism, animations | [main.css](file:///c:/Users/ahile/Downloads/H/src/styles/main.css), [index.css](file:///c:/Users/ahile/Downloads/H/src/index.css), [App.css](file:///c:/Users/ahile/Downloads/H/src/App.css) |
| **State Management** | React Context API + `useState` + `useEffect` | Central data store and action dispatchers | [HRMSContext.tsx](file:///c:/Users/ahile/Downloads/H/src/context/HRMSContext.tsx#L736-L1254) |
| **Persistence** | Browser `localStorage` | Syncs employees, attendance, leaves, and tasks client-side | [HRMSContext.tsx](file:///c:/Users/ahile/Downloads/H/src/context/HRMSContext.tsx#L790-L805) |
| **Routing** | Custom Conditional State-based Router (`activeModule`) | Switches active component views inside `<AppLayout />` | [AppLayout.tsx](file:///c:/Users/ahile/Downloads/H/src/components/layout/AppLayout.tsx#L50-L84) |
| **Form Handling** | Native React Controlled Inputs (`useState`) | Input forms for employees, leaves, tasks, expenses, shifts | [AddEmployeeModal.tsx](file:///c:/Users/ahile/Downloads/H/src/components/employees/AddEmployeeModal.tsx#L45-L47) |
| **Authentication** | Dummy Persona Role Switcher (`useState`) | Client-side role selection (Super Admin, HR Admin, etc.) | [App.tsx](file:///c:/Users/ahile/Downloads/H/src/App.tsx#L7), [LoginPage.tsx](file:///c:/Users/ahile/Downloads/H/src/components/auth/LoginPage.tsx#L18) |
| **Data Fetching / API** | *None* | No `fetch`, `axios`, `React Query`, or GraphQL client used | Checked codebase; no network fetching modules exist. |
| **Build Tool** | Vite `^8.2.2` with `@vitejs/plugin-react` `^6.1.0` | Development server & production bundler | [package.json](file:///c:/Users/ahile/Downloads/H/package.json#L24), [vite.config.ts](file:///c:/Users/ahile/Downloads/H/vite.config.ts) |
| **Package Manager** | npm (inferred from lockfile) | Package management | [package-lock.json](file:///c:/Users/ahile/Downloads/H/package-lock.json) |
| **Linting / Formatting** | Oxlint `^1.79.0` | Static code analysis and linting | [package.json](file:///c:/Users/ahile/Downloads/H/package.json#L22), [.oxlintrc.json](file:///c:/Users/ahile/Downloads/H/.oxlintrc.json) |

### Backend, Database, Infrastructure

- **Backend Framework / Runtime**: *Not found / Cannot determine from the available code.* (No server directory, no Node/Express/Fastify/Python backend).
- **API Architecture**: *Not found / Cannot determine from the available code.* (Client-side functions simulate API calls).
- **Database / ORM / Migrations**: *Not found / Cannot determine from the available code.* (Data is hardcoded initial mock data in memory + `localStorage`).
- **Caching / Queues**: *Not found / Cannot determine from the available code.*
- **Cloud / Infrastructure / Deployment**: *Not found / Cannot determine from the available code.* (Client-side SPA preview build configured via `vite preview`).

---

## 2. Application Architecture

### Architectural Overview

```
[ User Browser ]
       │
       ▼
 [ main.tsx ]  ──── ( Mounts App )
       │
       ▼
  [ App.tsx ]  ──── ( Checks isAuthenticated state )
       │
       ├── (False) ──► [ LoginPage.tsx ] ──── ( Select Demo Persona & switchRole() )
       │
       └── (True)  ──► [ HRMSProvider ] ( HRMSContext.tsx )
                              │
                              ▼
                       [ AppLayout.tsx ]
                          ├── [ Header.tsx ]  (Global Search, Role Switcher, Quick Add, Notifications)
                          ├── [ Sidebar.tsx ] (Module Navigation Links with RBAC checks)
                          └── [ View Container ]
                                 ├── [ Dashboard.tsx ] (KPIs, Canvas Attendance Trend, Geofence Map)
                                 ├── [ EmployeeList.tsx ] + [ EmployeeProfile.tsx ] + [ AddEmployeeModal.tsx ]
                                 ├── [ FaceAttendance.tsx ] (navigator.mediaDevices.getUserMedia WebCam)
                                 ├── [ AttendanceList.tsx ] (Punches, GPS records)
                                 ├── [ LeaveManagement.tsx ] (Leave requests & HR approvals)
                                 ├── [ ShiftManagement.tsx ] (Rosters & shift swaps)
                                 ├── [ TaskManagement.tsx ] (Kanban board & task assignment)
                                 ├── [ PerformanceTracking.tsx ] (Scores & department benchmarks)
                                 ├── [ RecruitmentPipeline.tsx ] (Candidates & referral tracking)
                                 ├── [ ExpenseManagement.tsx ] (Expense claims & reimbursements)
                                 ├── [ PayrollManagement.tsx ] (Payroll batch & printable payslips)
                                 ├── [ Organization.tsx ] (Visual Org Tree & Departments)
                                 ├── [ ReportsAnalytics.tsx ] (CSV export & printable executive summaries)
                                 ├── [ NotificationCenter.tsx ] (Global broadcast announcements)
                                 └── [ Settings.tsx ] (Super Admin Workflow Formats & RBAC Matrix)
```

### Entry Points & Core Components
- **Main Frontend Entry Point**: [main.tsx](file:///c:/Users/ahile/Downloads/H/src/main.tsx) (Renders `<App />` into DOM node `document.getElementById('root')`).
- **Application Root**: [App.tsx](file:///c:/Users/ahile/Downloads/H/src/App.tsx) (Wraps app in `<HRMSProvider>` and manages `isAuthenticated` toggle).
- **Layout Shell**: [AppLayout.tsx](file:///c:/Users/ahile/Downloads/H/src/components/layout/AppLayout.tsx) (Coordinates `<Sidebar />`, `<Header />`, and dynamic view rendering).
- **Central Data & Logic Hub**: [HRMSContext.tsx](file:///c:/Users/ahile/Downloads/H/src/context/HRMSContext.tsx) (State provider containing 15 initial dataset collections, RBAC permission matrix engine, role switcher, and CRUD state handlers).

---

## 3. End-to-End User Flow (Example Traces)

### Flow 1: Role Switching & RBAC Navigation
1. **User Action**: User selects a role (e.g., `Employee` or `Finance Manager`) from the top Header dropdown or Login persona picker.
2. **Frontend Handler**: `switchRole(newRole)` in [HRMSContext.tsx](file:///c:/Users/ahile/Downloads/H/src/context/HRMSContext.tsx#L808-L847) updates `currentUser` state with corresponding name, email, department, and role.
3. **RBAC Evaluation**: [Sidebar.tsx](file:///c:/Users/ahile/Downloads/H/src/components/layout/Sidebar.tsx#L80) calls `hasPermission(module, 'view')`. If `false`, navigation item is hidden or restricted.
4. **UI Render**: Components automatically update their scoped views (e.g., an `Employee` sees only their own profile, attendance logs, and payslips; `Super Admin` sees company-wide data).

### Flow 2: Applying & Approving a Leave Request
1. **User Action**: Employee opens "Apply Leave" modal, selects leave type, dates, and submits form.
2. **State Dispatch**: `applyLeave()` in [HRMSContext.tsx](file:///c:/Users/ahile/Downloads/H/src/context/HRMSContext.tsx#L969-L985) creates a new `LeaveRequest` with `status: 'Pending'`, appends it to `leaveRequests`, syncs to `localStorage`, and triggers a notification.
3. **Approval Action**: HR Admin views `LeaveManagement.tsx` or `Dashboard.tsx` widget and clicks "Approve".
4. **State Update & Sync**: `approveLeave()` in [HRMSContext.tsx](file:///c:/Users/ahile/Downloads/H/src/context/HRMSContext.tsx#L987-L1010) updates status to `'Approved'` AND automatically syncs today's attendance record (`AttendanceRecord.status = 'On Leave'`).

### Flow 3: WebCam Face Attendance Check-In
1. **User Action**: User navigates to Face Attendance, selects an employee, and clicks "Turn On Camera".
2. **Browser Hardware Call**: [FaceAttendance.tsx](file:///c:/Users/ahile/Downloads/H/src/components/attendance/FaceAttendance.tsx#L36-L67) invokes `navigator.mediaDevices.getUserMedia()` and binds video stream to `<video>` element.
3. **Scan Trigger**: User clicks "Check-In Scan". Component simulates landmark scanning with CSS overlay.
4. **State Dispatch**: `markAttendance()` updates attendance status to `'Present'`, and `addFaceLog()` records a success log entry with 98.6% confidence score. Camera turns off automatically after 3 seconds for privacy.

---

## 4. Frontend Deep Dive

### Page & Component Structure
- **Auth**: `LoginPage.tsx` (Persona quick-launcher)
- **Core Operations**: `Dashboard.tsx`, `EmployeeList.tsx`, `EmployeeProfile.tsx`, `AddEmployeeModal.tsx`, `Organization.tsx`
- **Attendance & Timekeeping**: `FaceAttendance.tsx`, `AttendanceList.tsx`, `ShiftManagement.tsx`, `LeaveManagement.tsx`
- **Productivity & Finance**: `TaskManagement.tsx`, `PerformanceTracking.tsx`, `ExpenseManagement.tsx`, `PayrollManagement.tsx`
- **Business & Admin**: `RecruitmentPipeline.tsx`, `ReportsAnalytics.tsx`, `NotificationCenter.tsx`, `Settings.tsx`

### Real vs. Dummy / Mock Implementations
- **REAL Client-Side Features**:
  - Full React state management and reactivity across all 15 modules.
  - Granular RBAC permission check engine (`hasPermission()`).
  - WebCam stream access via HTML5 `getUserMedia` API.
  - HTML5 Canvas drawing for Attendance Trend & Department Performance Charts.
  - Dynamic `localStorage` persistence for employees, attendance, leaves, and tasks.
  - Dynamic CSV export generation (Blob URL downloading) across Employee, Attendance, and Analytics pages.
  - CSS layout responsiveness, dark sidebar glassmorphism styling, and modal overlays.
- **MOCK / SIMULATED Features**:
  - **Authentication**: `LoginPage.tsx` bypasses real passwords and switches roles instantly.
  - **Facial Recognition AI**: No TensorFlow or OpenCV models are loaded; `FaceAttendance.tsx` uses a fixed `setTimeout(..., 1800)` timer to output a hardcoded 98.6% match confidence score.
  - **GPS Geofencing**: Geofence coordinates and maps in `Dashboard.tsx` are static CSS elements and simulated lat/lng objects.
  - **Image Receipts / Document Storage**: Documents and receipts point to Unsplash stock photo URLs (`#` or `https://images.unsplash.com/...`).

---

## 5. Backend Deep Dive

* **Real Backend APIs**: None.
* **Mock Backend APIs**: Simulated in-memory functions inside `HRMSContext.tsx` (`addEmployee`, `applyLeave`, `markAttendance`, `processPayrollBatch`, etc.).
* **Hardcoded Responses**: Initial arrays (`INITIAL_EMPLOYEES`, `INITIAL_ATTENDANCE`, `INITIAL_LEAVES`, `INITIAL_TASKS`, `INITIAL_PAYROLL`, etc.) are pre-populated directly in code.
* **Backend Incompleteness**: There is no server codebase, no HTTP client layer, no REST API contracts, and no WebSocket server.

---

## 6. Database

* **Database Technology**: *None / Browser localStorage*.
* **Connection Configuration**: *None*.
* **Schema / Models**: Defined via TypeScript interfaces in [hrms.ts](file:///c:/Users/ahile/Downloads/H/src/types/hrms.ts):
  - `User`, `Employee`, `BankDetails`, `AttendanceRecord`, `FaceLog`, `LeaveRequest`, `Shift`, `ShiftRequest`, `TaskItem`, `PerformanceScore`, `JobOpening`, `Candidate`, `Expense`, `NotificationItem`, `PayrollRecord`, `DepartmentItem`, `PermissionMatrix`.
* **Database Relationship Overview**:
  - `Employee.employeeId` <---> `AttendanceRecord.employeeId`
  - `Employee.employeeId` <---> `LeaveRequest.employeeId`
  - `Employee.employeeId` <---> `TaskItem.assignedEmployeeId`
  - `Employee.employeeId` <---> `PayrollRecord.employeeId`
  - `Employee.department` <---> `DepartmentItem.name`
  - `JobOpening.id` <---> `Candidate.jobId`

---

## 7. API Inventory

Since this application is a pure client-side SPA with no backend HTTP server, **no network REST/GraphQL APIs exist in the codebase**. Below is the inventory of internal Context action handlers simulating backend API endpoints:

| Action Handler | Invoking Frontend Component | Internal Purpose | Auth / Role Scope Required | Target State / Storage |
| :--- | :--- | :--- | :--- | :--- |
| `switchRole(role)` | `Header.tsx`, `LoginPage.tsx` | Switch current active persona | Public (Demo) | `currentUser` |
| `addEmployee(emp)` | `AddEmployeeModal.tsx`, `RecruitmentPipeline.tsx` | Create employee profile | Super Admin, HR Admin | `employees`, `localStorage` |
| `updateEmployee(id, emp)` | `EmployeeList.tsx` | Edit employee profile | Super Admin, HR Admin | `employees`, `localStorage` |
| `deleteEmployee(id)` | `EmployeeList.tsx` | Delete employee record | Super Admin, HR Admin | `employees`, `localStorage` |
| `markAttendance(...)` | `FaceAttendance.tsx`, `AttendanceList.tsx` | Check-in / Punch attendance | Any Authenticated | `attendanceRecords`, `localStorage` |
| `applyLeave(req)` | `LeaveManagement.tsx`, `Header.tsx` | Submit leave request | Any Authenticated | `leaveRequests`, `localStorage` |
| `approveLeave(id, by)` | `LeaveManagement.tsx`, `Dashboard.tsx` | Approve leave & mark attendance | Super Admin, HR Admin | `leaveRequests`, `attendanceRecords` |
| `addTask(task)` | `TaskManagement.tsx`, `Header.tsx` | Assign task item | Admin / Manager | `tasks`, `localStorage` |
| `updateTaskStatus(id, status)` | `TaskManagement.tsx` | Update status & boost score | Any Authenticated | `tasks`, `performanceScores` |
| `processPayrollBatch()` | `PayrollManagement.tsx` | Calculate monthly salaries | Finance Manager, Super Admin | `payrollRecords` |
| `setWorkflowFormat(format)` | `Settings.tsx` | Configure approval workflow | Super Admin Only | `workflowFormat` |

---

## 8. Authentication & Authorization

### Authentication Flow
1. User loads app (`App.tsx` defaults `isAuthenticated = true`).
2. If `isAuthenticated` is set to `false`, `<LoginPage />` is shown.
3. User selects a Demo Persona (e.g., `Super Admin`, `HR Admin`, `Department Manager`, `Employee`, `Finance Manager`).
4. Clicking "Sign In" calls `switchRole(selectedRolePreset)` which mutates `currentUser` state with predefined demo credentials and sets `isAuthenticated = true`.

### Granular RBAC Permission Matrix
Defined in [HRMSContext.tsx](file:///c:/Users/ahile/Downloads/H/src/context/HRMSContext.tsx#L27-L113) and editable live by Super Admins in [Settings.tsx](file:///c:/Users/ahile/Downloads/H/src/components/settings/Settings.tsx#L251-L307):

```
Module              Super Admin     HR Admin        Dept Manager    Employee        Finance Mgr
-----------------------------------------------------------------------------------------------
Dashboard           Full            View, Export    View            View            View
Employees           Full            Full            View            Restricted      View
Face Attendance     Full            View, Create    View            View, Create    View
Attendance          Full            View, Approve   View, Approve   View            View
Leaves              Full            View, Approve   View, Approve   View, Create    View
Shifts              Full            View, Approve   View, Approve   View, Create    View
Performance         Full            View, Create    View, Edit      View            View
Tasks               Full            View, Create    Full            View, Edit      View
Recruitment         Full            Full            View            View, Referral  Restricted
Finance & Expense   Full            Full            View, Approve   View, Create    Full
Payroll             Full            Full            Restricted      View Payslip    Full
Reports             Full            View, Export    View            Restricted      View, Export
Settings & RBAC     Full            View, Edit      Restricted      Restricted      View
```

---

## 9. Environment & Configuration

- **Environment Files**: No `.env` or `.env.local` files exist in the repository.
- **Configuration Files**:
  - [package.json](file:///c:/Users/ahile/Downloads/H/package.json): Defines dependencies and npm scripts (`dev`, `build`, `lint`, `preview`).
  - [vite.config.ts](file:///c:/Users/ahile/Downloads/H/vite.config.ts): Configures Vite dev server and React plugin.
  - [tsconfig.json](file:///c:/Users/ahile/Downloads/H/tsconfig.json) & [tsconfig.app.json](file:///c:/Users/ahile/Downloads/H/tsconfig.app.json): TypeScript compilation parameters.
  - [.oxlintrc.json](file:///c:/Users/ahile/Downloads/H/.oxlintrc.json): Linter rules configuration.
- **Secrets & Credentials**: None present.

---

## 10. Dependencies Analysis

From [package.json](file:///c:/Users/ahile/Downloads/H/package.json):

### Production Dependencies
- `react` (`^19.2.8`): Modern React UI core framework.
- `react-dom` (`^19.2.8`): DOM binding layer for React.
- `lucide-react` (`^1.37.0`): Enterprise SVG icon set.

### Development Dependencies
- `vite` (`^8.2.2`): Next-gen frontend build tool.
- `@vitejs/plugin-react` (`^6.1.0`): Vite React integration.
- `typescript` (`~6.0.2`): Language compiler.
- `oxlint` (`^1.79.0`): High-performance Rust-based JavaScript/TypeScript linter.
- `@types/react`, `@types/react-dom`, `@types/node`: Type definitions.

### Dependency Audit Findings
- **Clean Architecture**: Minimal dependency footprint (only 3 production packages). No bloated heavy UI frameworks (e.g. Bootstrap, Tailwind, Ant Design).
- **No Duplicates**: Zero duplicate libraries.
- **No Unused Packages**: All listed dependencies are directly used in source files.

---

## 11. Application Purpose

### Intended Functionality & Users
ApexHRMS is designed as an all-in-one corporate HR operational center. The target user personas are:
1. **Super Admin**: System governance, global approval format selection, company profile, and RBAC matrix management.
2. **HR Admin**: Employee onboarding, leave approvals, shift management, recruitment postings, and payroll processing.
3. **Department Manager**: Team supervision, task creation, attendance tracking, and performance reviews.
4. **Employee**: Self-service portal (personal profile, face/manual attendance check-in, leave application, expense claims, task tracking, payslips).
5. **Finance Manager**: Expense reimbursement approvals and monthly payroll batch verification.

---

## 12. Frontend + Backend Gap Analysis

| Feature Area | Frontend Status | Backend Status | Implementation Type | Missing / Gap Description |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication** | Persona dropdown selection | Missing | Demo Mock | No real password hashing, JWT/session tokens, or OAuth2 server. |
| **Database Storage** | React State + `localStorage` | Missing | Client Persistence | Data is lost if browser storage is cleared. No SQL/NoSQL DB connection. |
| **Facial Recognition** | WebCam hardware video stream | Missing | Simulated | No real AI face embedding vectors or biometric verification server. |
| **GPS Geofencing** | Simulated CSS UI map | Missing | Client Mock | No real HTML5 Geolocation API integration or server boundary check. |
| **File / Receipt Upload** | File picker inputs | Missing | Mock Links | Files are not saved to S3/Cloud Storage; uses stock image URLs. |
| **Payroll Processing** | Math calculation functions | Missing | Client Computation | No bank gateway payout API (Stripe, Plaid, ACH). |
| **Notifications** | Context state array | Missing | Client Memory | No email (SMTP), WebPush, or SMS (Twilio) integration. |

---

## 13. Complete Technology Stack Summary

```yaml
Frontend:
  Framework: React 19.2.8
  Language: TypeScript 6.0.2
  UI Icons: Lucide React 1.37.0
  Styling: Vanilla CSS (Custom Properties, Flexbox/Grid, Dark/Light Themes)
  State: React Context API + LocalStorage
  Routing: Custom Component Switcher
  Build Tool: Vite 8.2.2
  Linter: Oxlint 1.79.0

Backend:
  Framework: None (Client-Side SPA)
  Language: N/A
  Runtime: Browser JS Engine
  API Architecture: N/A
  Database: None (LocalStorage mock)

Infrastructure:
  Hosting: Static Web Server (Client-Side SPA Build)
  Containers: None
  Cloud Services: None
```

---

## 14. Final End-to-End Application Explanation

1. **When a user selects a persona role and signs in**: The frontend updates `currentUser` state in [HRMSContext.tsx](file:///c:/Users/ahile/Downloads/H/src/context/HRMSContext.tsx#L808), which immediately re-evaluates the RBAC permissions across [Sidebar.tsx](file:///c:/Users/ahile/Downloads/H/src/components/layout/Sidebar.tsx) and filters module views.
2. **When an employee scans their face for attendance**: The frontend invokes `navigator.mediaDevices.getUserMedia()` in [FaceAttendance.tsx](file:///c:/Users/ahile/Downloads/H/src/components/attendance/FaceAttendance.tsx#L36), displays the live WebCam feed, simulates landmark alignment, logs a 98.6% confidence result, updates attendance status to `'Present'`, and turns off the camera hardware after 3 seconds for privacy.
3. **When an employee applies for leave**: The frontend calls `applyLeave()` in [HRMSContext.tsx](file:///c:/Users/ahile/Downloads/H/src/context/HRMSContext.tsx#L969), creating a `'Pending'` request record, appending it to `localStorage`, and broadcasting a notification to the Header drawer.
4. **When an HR Admin approves a leave request**: The frontend executes `approveLeave()`, which marks the leave request as `'Approved'` and automatically updates today's attendance record status for that employee to `'On Leave'`.
5. **When a manager completes a task**: Updating a task status to `'Completed'` in [TaskManagement.tsx](file:///c:/Users/ahile/Downloads/H/src/components/tasks/TaskManagement.tsx#L127) automatically increases that employee's completion rate and overall score in [PerformanceTracking.tsx](file:///c:/Users/ahile/Downloads/H/src/components/performance/PerformanceTracking.tsx).
6. **When a manager processes payroll**: Clicking "Process August Payroll Batch" in [PayrollManagement.tsx](file:///c:/Users/ahile/Downloads/H/src/components/payroll/PayrollManagement.tsx#L29) calculates net pay for every employee based on basic salary, allowances, attendance days present, and 12% tax deduction, producing printable/downloadable PDF payslips.
7. **When a Super Admin updates approval workflows or permissions**: [Settings.tsx](file:///c:/Users/ahile/Downloads/H/src/components/settings/Settings.tsx#L100-L248) updates the `workflowFormat` or granular role checkbox matrix live in React Context, immediately altering system approval rules across all modules.
