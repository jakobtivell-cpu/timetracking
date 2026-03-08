-- ============================================================
-- Egaux Time Tracking — Complete Database Schema
-- Target: Azure SQL / SQL Server 2019+
-- Run this ONCE on a fresh database.
-- All subsequent changes go in numbered migration files.
-- ============================================================

-- 1. Customer
IF OBJECT_ID('dbo.Customer', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Customer (
    CustomerId      INT IDENTITY(1,1) PRIMARY KEY,
    CustomerName    NVARCHAR(200)   NOT NULL,
    CurrencyCode    CHAR(3)         NOT NULL DEFAULT 'SEK',
    IsActive        BIT             NOT NULL DEFAULT 1,
    CreatedAtUtc    DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc    DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE UNIQUE INDEX UX_Customer_Name
    ON dbo.Customer (CustomerName)
    WHERE IsActive = 1;
END
GO

-- 2. Task
IF OBJECT_ID('dbo.Task', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Task (
    TaskId              INT IDENTITY(1,1) PRIMARY KEY,
    TaskName            NVARCHAR(200)   NOT NULL,
    DefaultRatePerHour  DECIMAL(19,4)   NOT NULL DEFAULT 0,
    IsBillable          BIT             NOT NULL DEFAULT 1,
    IsActive            BIT             NOT NULL DEFAULT 1,
    CreatedAtUtc        DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc        DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE UNIQUE INDEX UX_Task_Name
    ON dbo.Task (TaskName)
    WHERE IsActive = 1;
END
GO

-- 3. CustomerTaskResponsible
IF OBJECT_ID('dbo.CustomerTaskResponsible', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CustomerTaskResponsible (
    CustomerId      INT             NOT NULL REFERENCES dbo.Customer(CustomerId),
    TaskId          INT             NOT NULL REFERENCES dbo.Task(TaskId),
    ResponsibleName NVARCHAR(200)   NOT NULL,
    IsActive        BIT             NOT NULL DEFAULT 1,
    CreatedAtUtc    DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc    DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_CustomerTaskResponsible PRIMARY KEY (CustomerId, TaskId)
  );
END
GO

-- 4. TimeEntry
IF OBJECT_ID('dbo.TimeEntry', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TimeEntry (
    TimeEntryId     INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId      INT             NOT NULL REFERENCES dbo.Customer(CustomerId),
    TaskId          INT             NOT NULL REFERENCES dbo.Task(TaskId),
    ConsultantName  NVARCHAR(200)   NULL,
    StartTimeUtc    DATETIME2(0)    NOT NULL,
    EndTimeUtc      DATETIME2(0)    NULL,
    DurationSeconds INT             NULL,
    RatePerHour     DECIMAL(19,4)   NOT NULL,
    CostAmount      DECIMAL(19,4)   NULL,
    CurrencyCode    CHAR(3)         NOT NULL DEFAULT 'SEK',
    Notes           NVARCHAR(MAX)   NULL,
    CancelledAtUtc  DATETIME2(0)    NULL,
    CreatedAtUtc    DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc    DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME()
  );

  -- One running entry per consultant
  CREATE UNIQUE INDEX UX_TimeEntry_OneRunning
    ON dbo.TimeEntry (ConsultantName)
    WHERE EndTimeUtc IS NULL AND CancelledAtUtc IS NULL;

  -- Fast lookups by customer + time range
  CREATE INDEX IX_TimeEntry_Customer_Start
    ON dbo.TimeEntry (CustomerId, StartTimeUtc)
    INCLUDE (TaskId, EndTimeUtc, DurationSeconds, RatePerHour, CostAmount, CurrencyCode, ConsultantName, CancelledAtUtc);

  -- Fast running-entry lookups
  CREATE INDEX IX_TimeEntry_Running
    ON dbo.TimeEntry (CustomerId, EndTimeUtc)
    WHERE EndTimeUtc IS NULL AND CancelledAtUtc IS NULL;
END
GO

-- 5. Approval
IF OBJECT_ID('dbo.Approval', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Approval (
    ApprovalId      INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId      INT             NOT NULL REFERENCES dbo.Customer(CustomerId),
    PeriodKey       VARCHAR(7)      NOT NULL,  -- 'YYYY-MM'
    ApprovedBy      NVARCHAR(200)   NOT NULL,
    ApprovedAtUtc   DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME(),
    RevokedAtUtc    DATETIME2(0)    NULL,

    CONSTRAINT UQ_Approval_Customer_Period UNIQUE (CustomerId, PeriodKey)
  );
END
GO

PRINT 'Schema creation complete.';
