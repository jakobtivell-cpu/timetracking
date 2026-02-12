# Time tracking — Egaux (Static Web Apps MVP)

This repo is a **no-build-step** MVP:
- 3 pages: **Mobile**, **Customer**, **Admin**
- Frontend = plain HTML + CSS + JS (no frameworks)
- Backend = Azure Static Web Apps **Azure Functions** in `/api`
- Database = Azure SQL via `mssql`

The point: keep the surface area small so you can iterate in production without turning it into a React/Next/Build-Tool religion war.

---

## Pages

### `mobile.html`
Minimal “task buttons” tracker.
- Tap a task ⇒ starts (or switches) timer
- Tap **Pause** ⇒ stops the current task and enters a local break timer (not billed)
- Tap **Cancel** ⇒ cancels the current running entry (deletes it if it’s in the DB)
- Stealth clock/gauge shows **billed hours today** (billable tasks only)

### `customer.html`
Customer reporting:
- Totals (hours + SEK)
- Cost per task (bars)
- Cost distribution (donut)
- Logs
- **Currently working on** (running timers)
- **Consultant overview** (hours + SEK per consultant, plus forecast for current month)

### `admin.html`
Admin management:
- Add tasks (name + rate)
- Add customers
- Set responsibility per **customer + task** (task-level responsible)

---

## API

All API routes are under `/api/*` (Azure Functions).

### Read endpoints
- `GET /api/tasks`
- `GET /api/customers`
- `GET /api/timeentries?customerId=1&from=...&to=...&consultant=...`
- `GET /api/timeentries?customerId=1&running=1&consultant=...`
- `GET /api/admin/responsibilities`

### Write endpoints
- `POST /api/timeentries/start` `{ customerId, taskId, consultantName }`
- `POST /api/timeentries/stop` `{ timeEntryId }`
- `POST /api/timeentries/cancel` `{ timeEntryId }`
- `POST /api/admin/task` `{ name, rate }`
- `POST /api/admin/customer` `{ name }`
- `POST /api/admin/responsibility` `{ customerId, taskId, responsible }`

---

## Azure SQL connection (SWA Function app settings)

Set these environment variables in the Static Web App (Configuration → Application settings):
- `SQL_SERVER`
- `SQL_DATABASE`
- `SQL_USER`
- `SQL_PASSWORD`

---

## Notes / next steps

### Consultant support
The app supports per-consultant views if the column exists:
- `dbo.TimeEntry.ConsultantName NVARCHAR(200) NULL`

If that column doesn’t exist yet, the API will still work, but the “consultants” summary will collapse into a single bucket.

### Production hardening
When you’re ready:
- Add auth (SWA built-in auth) and store `UserId` instead of `ConsultantName`.
- Add row-level security so customers only see their own data.
- Add an invoice/approval table + workflow.

