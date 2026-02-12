-- Adds consultant attribution to time entries.
-- Safe to run multiple times.

IF COL_LENGTH('dbo.TimeEntry','ConsultantName') IS NULL
BEGIN
  ALTER TABLE dbo.TimeEntry
    ADD ConsultantName NVARCHAR(200) NULL;
END

-- Optional: backfill existing historical entries
-- UPDATE dbo.TimeEntry SET ConsultantName = 'Jakob Tivell' WHERE ConsultantName IS NULL;

-- Optional: speed up common queries
-- IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TimeEntry_Customer_EndTimeUtc' AND object_id = OBJECT_ID('dbo.TimeEntry'))
-- BEGIN
--   CREATE INDEX IX_TimeEntry_Customer_EndTimeUtc
--   ON dbo.TimeEntry (CustomerId, EndTimeUtc)
--   INCLUDE (StartTimeUtc, TaskId, RatePerHour, CostAmount, DurationMinutes);
-- END
