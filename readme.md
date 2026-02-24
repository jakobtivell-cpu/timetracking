# Time Tracking — Egaux (Static Web Apps MVP)

This repository contains a production-ready MVP time tracking application.

## Architecture

- **Frontend**: Plain HTML + CSS + JavaScript
- **Backend**: Azure Static Web Apps (Azure Functions under `/api`)
- **Database**: Azure SQL (via `mssql`)

The application consists of three pages:

- **Mobile** — Time tracking UI
- **Customer** — Reporting & overview
- **Admin** — Master data management

---

# Database Schema (Production Template)

All timestamps are stored in **UTC**.

All monetary values use:
- `DECIMAL(19,4)`
- Explicit `CurrencyCode CHAR(3)` (ISO 4217, e.g. SEK, EUR, USD)

---

## dbo.Customer

| Column | Type | Notes |
|--------|------|-------|
| CustomerId | INT (PK) | Identity |
| CustomerName | NVARCHAR(200) | |
| CurrencyCode | CHAR(3) | ISO 4217 (e.g. 'SEK') |
| IsActive | BIT | |
| CreatedAtUtc | DATETIME2 | |
| UpdatedAtUtc | DATETIME2 | |

### Sample

| CustomerId | CustomerName | CurrencyCode | IsActive |
|------------|-------------|--------------|----------|
| 1 | RN Nordic | SEK | 1 |

---

## dbo.Task

| Column | Type | Notes |
|--------|------|-------|
| TaskId | INT (PK) | Identity |
| TaskName | NVARCHAR(200) | |
| DefaultRatePerHour | DECIMAL(19,4) | Stored in customer's currency |
| IsBillable | BIT | |
| IsActive | BIT | |
| CreatedAtUtc | DATETIME2 | |
| UpdatedAtUtc | DATETIME2 | |

### Sample

| TaskId | TaskName | DefaultRatePerHour | IsBillable |
|--------|----------|-------------------|------------|
| 1 | Admin | 750.0000 | 1 |
| 2 | Forecast App | 1000.0000 | 1 |

---

## dbo.CustomerTaskResponsible

| Column | Type | Notes |
|--------|------|-------|
| CustomerId | INT (FK) | |
| TaskId | INT (FK) | |
| ResponsibleName | NVARCHAR(200) | |
| IsActive | BIT | |
| CreatedAtUtc | DATETIME2 | |
| UpdatedAtUtc | DATETIME2 | |

Unique constraint recommended on:

(CustomerId, TaskId) WHERE IsActive = 1


---

## dbo.TimeEntry

| Column | Type | Notes |
|--------|------|-------|
| TimeEntryId | INT (PK) | Identity |
| CustomerId | INT (FK) | |
| TaskId | INT (FK) | |
| ConsultantName | NVARCHAR(200) | Nullable for MVP |
| StartTimeUtc | DATETIME2 | |
| EndTimeUtc | DATETIME2 | NULL while running |
| DurationSeconds | INT | Computed on stop |
| RatePerHour | DECIMAL(19,4) | Snapshotted at start |
| CostAmount | DECIMAL(19,4) | Computed on stop |
| CurrencyCode | CHAR(3) | Copied from Customer |
| Notes | NVARCHAR(MAX) | |
| CancelledAtUtc | DATETIME2 | NULL unless cancelled |
| CreatedAtUtc | DATETIME2 | |
| UpdatedAtUtc | DATETIME2 | |

### Production Rules

- `DurationSeconds = DATEDIFF(SECOND, StartTimeUtc, EndTimeUtc)`
- `CostAmount = (DurationSeconds / 3600.0) * RatePerHour`
- No client-calculated durations or cost values are trusted.
- One running entry per consultant enforced via filtered unique index:

UNIQUE (ConsultantName)
WHERE EndTimeUtc IS NULL AND CancelledAtUtc IS NULL


---

# Pages

## mobile.html

Minimal task-button tracker.

Features:
- Tap task → Starts or switches timer
- Pause → Stops current task (break handled client-side, not billed)
- Cancel → Soft-cancels running entry
- Stealth daily billed hours indicator

---

## customer.html

Customer reporting:

- Total hours
- Total cost (in customer's currency)
- Cost per task (bar chart)
- Cost distribution (donut chart)
- Time logs
- Running timers
- Consultant overview:
  - Hours per consultant
  - Cost per consultant
  - Forecast for current month

All totals exclude:
- Cancelled entries
- Running entries (unless explicitly requested)

---

## admin.html

Administrative management:

- Add tasks (name + default rate)
- Add customers (name + currency)
- Set responsibility per customer + task

---

# API

All routes are under `/api/*`

---

## Read Endpoints


GET /api/tasks
GET /api/customers
GET /api/timeentries?customerId=1&from=...&to=...&consultant=...
GET /api/timeentries?customerId=1&running=1&consultant=...
GET /api/admin/responsibilities


### Query Rules

- `from` and `to` must be ISO8601 UTC
- Range rule: `from <= StartTimeUtc < to`
- `running=1` means:
  - `EndTimeUtc IS NULL`
  - `CancelledAtUtc IS NULL`

---

## Write Endpoints

### Start Time Entry


POST /api/timeentries/start
{
"customerId": 1,
"taskId": 2,
"consultantName": "Martin Fossum"
}


Server:
- Stops existing running entry for consultant (if any)
- Creates new row
- Copies rate + currency

---

### Stop Time Entry


POST /api/timeentries/stop
{
"timeEntryId": 123
}


Server:
- Computes duration
- Computes cost
- Returns full updated row
- Idempotent if already stopped

---

### Cancel Time Entry


POST /api/timeentries/cancel
{
"timeEntryId": 123
}


Server:
- Sets `CancelledAtUtc`
- Does not hard delete

---

### Admin


POST /api/admin/task
{
"name": "New Task",
"rate": 1200.00
}

POST /api/admin/customer
{
"name": "New Customer",
"currencyCode": "EUR"
}

POST /api/admin/responsibility
{
"customerId": 1,
"taskId": 2,
"responsibleName": "Consultant Name"
}


---

# Environment Variables (Azure Static Web App)

Configure in:

**Static Web App → Configuration → Application Settings**

Required variables:

- `SQL_SERVER`
- `SQL_DATABASE`
- `SQL_USER`
- `SQL_PASSWORD`

Recommended:
- Use Managed Identity instead of SQL credentials when possible.
- Ensure SQL user has least privilege.

---

# Production Hardening Checklist

- Enforce authentication (SWA built-in auth)
- Restrict `/api/admin/*` to admin role
- Server-side validation for all inputs
- SQL constraints + foreign keys
- Filtered unique index for running entries
- Structured logging in Azure Functions
- Health endpoint (`/api/health`)
- Rate limiting on write endpoints

---

# Consultant Support

If `ConsultantName` exists:
- Reporting is grouped per consultant.

If null:
- Reporting collapses into single bucket.

---

# Currency & Denomination Model

- Each customer operates in one currency.
- All time entries inherit currency at creation.
- Historical invoices remain stable even if task rates change.
- No cross-currency aggregation without explicit conversion logic.

---

End of specification.
