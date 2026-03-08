# Egaux Time Tracking

Consultant time-tracking application built for Azure Static Web Apps.

## Architecture

- **Frontend**: Plain HTML + CSS + JavaScript (no build step)
- **Backend**: Azure Functions (Node.js) under `/api`
- **Database**: Azure SQL via `mssql`
- **Deployment**: Azure Static Web Apps with GitHub Actions CI/CD
- **Auth**: Azure SWA built-in authentication (configured in `staticwebapp.config.json`)

## Pages

| Page | Purpose | Access |
|------|---------|--------|
| `mobile.html` | Time tracking (tap task → start/switch timer) | Authenticated |
| `customer.html` | Reporting, charts, approval | Authenticated |
| `admin.html` | Manage tasks, customers, responsibilities | Admin role |

## Database Schema

See `sql/000_create_schema.sql` for the complete DDL.

**Tables:** Customer, Task, CustomerTaskResponsible, TimeEntry, Approval

**Key design decisions:**
- All timestamps stored in UTC (`DATETIME2(0)`)
- Monetary values use `DECIMAL(19,4)` with explicit `CurrencyCode CHAR(3)`
- Duration stored as `DurationSeconds INT`, computed server-side on stop
- Cost computed server-side: `(DurationSeconds / 3600.0) * RatePerHour`
- Cancel is soft-delete (`CancelledAtUtc` timestamp, no hard DELETE)
- One running entry per consultant enforced via filtered unique index
- Approval is server-persisted per customer per month

## API Endpoints

### Read

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/tasks` | List active tasks |
| GET | `/api/customers` | List active customers (with CurrencyCode) |
| GET | `/api/timeentries?customerId=&from=&to=&consultant=&limit=&offset=` | List entries |
| GET | `/api/timeentries?customerId=&running=1` | Currently running entries |
| GET | `/api/admin/responsibilities` | Responsibility mappings |
| GET | `/api/approval?customerId=&periodKey=YYYY-MM` | Approval status |
| GET | `/api/health` | Health check (API + DB) |

### Write

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/timeentries/start` | Start timer (auto-stops previous in transaction) |
| POST | `/api/timeentries/stop` | Stop timer (computes duration + cost) |
| POST | `/api/timeentries/cancel` | Soft-cancel running entry |
| POST | `/api/admin/task` | Create/update task (name, rate, isBillable) |
| POST | `/api/admin/customer` | Create/update customer (name, currencyCode) |
| POST | `/api/admin/responsibility` | Set responsibility mapping |
| POST | `/api/approval` | Approve or revoke month |

## Environment Variables

Configure in Azure Static Web App → Settings → Environment variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `SQL_SERVER` | Yes | Azure SQL server hostname |
| `SQL_DATABASE` | Yes | Database name |
| `SQL_USER` | Yes | SQL authentication user |
| `SQL_PASSWORD` | Yes | SQL authentication password |

## Setup

1. Run `sql/000_create_schema.sql` on your Azure SQL database
2. Run any numbered migrations (`010_*.sql`, `011_*.sql`) in order
3. Set environment variables in Azure SWA configuration
4. Push to `main` branch — GitHub Actions deploys automatically

## PWA

The mobile page can be installed as a PWA ("Add to Home Screen") for full-screen app experience. Service worker caches static assets for fast loading.
