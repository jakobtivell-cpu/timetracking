-- ============================================================
-- Migration 011: Align schema with production spec
-- - Rename DurationMinutes → DurationSeconds (if exists)
-- - Add CurrencyCode to TimeEntry (if missing)
-- - Add CancelledAtUtc to TimeEntry (if missing)
-- - Add CurrencyCode to Customer (if missing)
-- Safe to run multiple times.
-- ============================================================

-- Rename DurationMinutes → DurationSeconds
IF COL_LENGTH('dbo.TimeEntry','DurationMinutes') IS NOT NULL
   AND COL_LENGTH('dbo.TimeEntry','DurationSeconds') IS NULL
BEGIN
  EXEC sp_rename 'dbo.TimeEntry.DurationMinutes', 'DurationSeconds', 'COLUMN';
  PRINT 'Renamed DurationMinutes → DurationSeconds';
END
GO

-- Add CurrencyCode to TimeEntry
IF COL_LENGTH('dbo.TimeEntry','CurrencyCode') IS NULL
BEGIN
  ALTER TABLE dbo.TimeEntry
    ADD CurrencyCode CHAR(3) NOT NULL DEFAULT 'SEK';
  PRINT 'Added CurrencyCode to TimeEntry';
END
GO

-- Add CancelledAtUtc to TimeEntry
IF COL_LENGTH('dbo.TimeEntry','CancelledAtUtc') IS NULL
BEGIN
  ALTER TABLE dbo.TimeEntry
    ADD CancelledAtUtc DATETIME2(0) NULL;
  PRINT 'Added CancelledAtUtc to TimeEntry';
END
GO

-- Add CurrencyCode to Customer
IF COL_LENGTH('dbo.Customer','CurrencyCode') IS NULL
BEGIN
  ALTER TABLE dbo.Customer
    ADD CurrencyCode CHAR(3) NOT NULL DEFAULT 'SEK';
  PRINT 'Added CurrencyCode to Customer';
END
GO

-- Create filtered unique index for one-running-entry-per-consultant (if missing)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TimeEntry_OneRunning' AND object_id = OBJECT_ID('dbo.TimeEntry'))
BEGIN
  CREATE UNIQUE INDEX UX_TimeEntry_OneRunning
    ON dbo.TimeEntry (ConsultantName)
    WHERE EndTimeUtc IS NULL AND CancelledAtUtc IS NULL;
  PRINT 'Created UX_TimeEntry_OneRunning index';
END
GO

PRINT 'Migration 011 complete.';
