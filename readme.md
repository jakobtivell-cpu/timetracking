# TimeTracking — DB/API “Do Not Step On Rakes” Guide

This repo is intentionally small (static HTML + Azure Static Web Apps “api” functions). That’s great — it also means **a couple of naming/contract mismatches can silently break everything**.

This document locks down:
- **DB contracts** (tables + stored procedures)
- **API routes & JSON shapes**
- **Units + money rules**
- **Common pitfalls already present in the repo** (and how to fix them)

---

## 1) Current repo reality (what exists today)

### Frontend
- `mobile.html` + `js/mobile.js` is the active timer UI.
- It calls:
  - `GET /api/tasks/active`
  - `POST /api/timeentries/start { taskId }`
  - `POST /api/timeentries/stop { timeEntryId }`
- It expects the start response to contain: `res.timeEntryId` (camelCase).

### API (Azure Static Web Apps Functions, Node)
- `api/_shared/db.js` creates an MSSQL connection pool from env vars.
- `api/tasks/index.js` currently runs:
  - `SELECT TaskId, TaskName FROM Task WHERE IsActive=1`
- `api/timeentries/start.js` calls `EXEC dbo.sp_TimeEntry_Start @TaskId=@TaskId`
- `api/timeentries/stop.js` calls `EXEC dbo.sp_TimeEntry_StopNow @TimeEntryId=@TimeEntryId`

### DB (implied)
From your sample: `TimeEntry` and `Task` tables exist.
Two stored procedures are required but not currently in the repo:
- `dbo.sp_TimeEntry_Start`
- `dbo.sp_TimeEntry_StopNow`

---

## 2) The already-present foot-guns (fix these first)

### 2.1 Route mismatch: `/api/tasks/active` vs `/api/tasks`
`api/tasks/index.js` maps (by default) to **`/api/tasks`**, not `/api/tasks/active`.

**Fix options (pick one):**
1) **Simplest:** change frontend to `GET /api/tasks`
2) **Keep frontend:** create `api/tasks/active/index.js` (or `api/tasks/active.js` depending on your routing model) that returns active tasks.

**Recommendation:** option 1 (rename client) unless you *need* the semantic route.

### 2.2 Response shape mismatch: `TimeEntryId` vs `timeEntryId`
MSSQL resultsets tend to return `TimeEntryId` (PascalCase) because your columns are PascalCase.
`mobile.js` expects `res.timeEntryId`.

**Fix:** API must map DB columns → **camelCase JSON** consistently.

Example mapping:
- `TimeEntryId` → `timeEntryId`
- `TaskId` → `taskId`
- `TaskName` → `taskName`
- `DefaultRatePerHour` → `defaultRatePerHour`

### 2.3 Duration duplication (`DurationMinutes` + `DurationSeconds`)
Your sample table has both. That’s a data drift factory.

**Rule:** store *one* canonical duration (recommended: seconds) or compute from timestamps.

---

## 3) Naming + denomination rules (boring, therefore powerful)

### 3.1 Time
- Persist timestamps in **UTC** only: `StartTimeUtc`, `EndTimeUtc`, `CreatedAtUtc`, `UpdatedAtUtc`
- API uses ISO-8601 with `Z`.
- Duration canonical unit: **seconds** (`durationSeconds`)

### 3.2 Money
- DB types: **DECIMAL**, never float.
- Suggested:
  - rates: `DECIMAL(19,4)`
  - amounts: `DECIMAL(19,2)`
- API transmits money as **strings** to avoid JS float issues:
  - `"ratePerHour": "750.0000"`
  - `"costAmount": "3.12"`

### 3.3 JSON casing
- **camelCase** in JSON everywhere.
- DB stays PascalCase if you want; the API is responsible for mapping.

---

## 4) DB contracts (tables + constraints)

### 4.1 Task (already exists)
Minimum columns (your sample):
- `TaskId` (PK)
- `TaskName`
- `DefaultRatePerHour`
- `IsBillable`
- `IsActive`
- `CreatedAtUtc`, `UpdatedAtUtc`

Constraints:
- `DefaultRatePerHour >= 0`
- `TaskName` not null
- `IsActive` not null

### 4.2 TimeEntry (already exists, but should be clarified)
From sample:
- `TimeEntryId`, `CustomerId`, `TaskId`
- `StartTimeUtc`, `EndTimeUtc`
- `DurationMinutes`, `DurationSeconds`
- `RatePerHour`, `CostAmount`
- `Notes`
- `CreatedAtUtc`, `UpdatedAtUtc`

**Hard constraints (add if missing):**
- `StartTimeUtc` NOT NULL
- `EndTimeUtc` NULL allowed only if running timers are allowed
- If `EndTimeUtc` not null: `EndTimeUtc > StartTimeUtc`
- `RatePerHour >= 0`
- Foreign keys: `TaskId -> Task(TaskId)`
- Indexes:
  - `(CustomerId, StartTimeUtc DESC)`
  - `(TaskId, StartTimeUtc DESC)`

**Canonical-duration decision (recommended):**
- Keep `DurationSeconds` only (or compute it)
- Treat `DurationMinutes` as derived/view-only

---

## 5) Stored procedure contracts (this is the critical missing piece)

### 5.1 `dbo.sp_TimeEntry_Start`
**Purpose:** Start a timer for a given task. Server sets start time and rate snapshot.

**Inputs**
- `@TaskId INT` (required)
- Optional (future): `@CustomerId INT`, `@UserId INT`, `@StartTimeUtc DATETIME2`

**Behavior**
1) Validate task exists and is active.
2) Insert into `TimeEntry`:
   - `TaskId = @TaskId`
   - `StartTimeUtc = SYSUTCDATETIME()` (or passed value)
   - `EndTimeUtc = NULL`
   - `RatePerHour = Task.DefaultRatePerHour` (snapshot)
   - `CreatedAtUtc/UpdatedAtUtc = SYSUTCDATETIME()`
3) Return the new id **as `TimeEntryId`**.

**Return shape (DB)**
- a single-row recordset with `TimeEntryId`

**Important rule:** Do not accept `RatePerHour` from the client unless you have explicit admin/edit flows.

### 5.2 `dbo.sp_TimeEntry_StopNow`
**Purpose:** Stop a running timer *now*, compute duration and cost.

**Inputs**
- `@TimeEntryId INT` (required)

**Behavior**
1) Validate entry exists.
2) If already stopped (`EndTimeUtc IS NOT NULL`), either:
   - treat as idempotent OK (recommended), or
   - return a clear error (less friendly for retries)
3) Set:
   - `EndTimeUtc = SYSUTCDATETIME()`
   - `DurationSeconds = DATEDIFF(SECOND, StartTimeUtc, EndTimeUtc)`
   - `CostAmount = ROUND(RatePerHour * (DurationSeconds / 3600.0), 2)`
   - `UpdatedAtUtc = SYSUTCDATETIME()`

**Edge rules**
- If `DurationSeconds < 0` → reject (clock skew / bad data)
- If `DurationSeconds` is extremely large → optionally reject or flag

---

## 6) API contract (what the frontend can rely on)

### 6.1 `GET /api/tasks` (or `/api/tasks/active` if you implement it)
**Response (JSON)**
```json
[
  {
    "taskId": 1,
    "taskName": "Admin",
    "defaultRatePerHour": "750.0000",
    "isBillable": true,
    "isActive": true
  }
]
```

**Note:** today the API only returns `TaskId, TaskName`. Expand as needed, but keep casing consistent.

### 6.2 `POST /api/timeentries/start`
**Request**
```json
{ "taskId": 2 }
```

**Response**
```json
{ "timeEntryId": 123 }
```

### 6.3 `POST /api/timeentries/stop`
**Request**
```json
{ "timeEntryId": 123 }
```

**Response**
```json
{ "ok": true }
```

---

## 7) Implementation guidelines for the Node functions (fast + safe)

### 7.1 Validate inputs (don’t let “undefined” hit SQL)
- `taskId` and `timeEntryId` must be integers.
- If missing/invalid: return `400` with a JSON error object.

### 7.2 Always return JSON in a consistent error format
Example:
```json
{ "error": "Invalid taskId", "code": "BAD_REQUEST" }
```

### 7.3 Strongly type MSSQL params
In `mssql`, do:
- `.input('TaskId', sql.Int, taskId)`
instead of relying on inference.

### 7.4 Map DB recordsets to camelCase DTOs
Do not leak DB casing or column names into the frontend.

### 7.5 Idempotency for stop
Stopping twice should not break the UX. Treat it as OK unless you have a reason not to.

---

## 8) Minimal code changes to unbreak the app

### Option A (recommended): change frontend route to `/api/tasks`
In `js/mobile.js`:
- change `API.get('/api/tasks/active')` → `API.get('/api/tasks')`

### And fix start response casing
In `api/timeentries/start.js`, map the recordset to camelCase:
- If DB returns `{ TimeEntryId: 123 }`, return `{ timeEntryId: 123 }`.

---

## 9) “Definition of done” for this module
- Stored procs exist and match the contracts above.
- API routes match frontend.
- JSON casing is camelCase everywhere.
- Duration is canonical (seconds) and computed server-side.
- Cost is computed server-side with explicit rounding.
- Inputs validated; errors are JSON, not random text.

---

## 10) TODO decisions (answer once, then freeze in code)
1) Currency (single or multi)?
2) Rounding mode (bankers vs away-from-zero)?
3) Are “running timers” allowed (EndTimeUtc null)?
4) Do we need Customer/User ownership fields now or later?
5) Are manual edits allowed after stop? after invoicing?
