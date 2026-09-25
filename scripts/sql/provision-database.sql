-- Provisions a SQL Server database for the portal.
--
-- Run once per environment, as a login that can create databases and logins
-- (sysadmin, or dbcreator + securityadmin). Everything after this is
-- `prisma migrate deploy`, which needs no such rights.
--
--   sqlcmd -S <server> -U <admin> -P <password> -C -i provision-database.sql \
--          -v DbName="ticketit" AppPassword="<strong>" MigratorPassword="<strong>"
--
-- Nothing here is destructive: every step is guarded, so re-running it against
-- an existing environment is safe and changes nothing.
--
-- ---------------------------------------------------------------------------
-- Two logins, and what they are for
-- ---------------------------------------------------------------------------
-- The migrator owns the schema and is the only one that runs migrations. The
-- application gets data rights and nothing else, so a bug in a route handler
-- cannot drop a table.
--
-- This is not what enforces tenant isolation -- Row-Level Security applies to
-- every user including db_owner, and SQL Server has no BYPASSRLS to withhold.
-- It is ordinary least privilege, and it is also what stops `migrate dev` being
-- run against production by accident: the application login simply cannot.

:setvar DbName "ticketit"

-- ---------------------------------------------------------------------------
-- 1. The database
-- ---------------------------------------------------------------------------
--
-- The collation must be case-insensitive. Catalogue search leans on it: Prisma's
-- SQL Server connector does not accept `mode: 'insensitive'`, so the queries
-- were written without it and rely on the collation to match "banner" against
-- "Banner". A CS collation would silently make search case-sensitive.
IF DB_ID('$(DbName)') IS NULL
BEGIN
  CREATE DATABASE [$(DbName)] COLLATE SQL_Latin1_General_CP1_CI_AS;
  PRINT 'created database $(DbName)';
END
ELSE
  PRINT 'database $(DbName) already exists';
GO

-- Read-committed snapshot, and it is not a tuning knob.
--
-- This application was written against PostgreSQL, whose READ COMMITTED never
-- blocks a reader behind a writer. SQL Server's default takes shared locks
-- instead, so the same queries stall or deadlock under concurrency PostgreSQL
-- handled without noticing -- the checkout path, which reads stock while another
-- checkout is reserving it, is the obvious casualty.
ALTER DATABASE [$(DbName)] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
PRINT 'read-committed snapshot is on';
GO

-- ---------------------------------------------------------------------------
-- 2. Logins
-- ---------------------------------------------------------------------------

IF SUSER_ID('ticketit_migrator') IS NULL
BEGIN
  CREATE LOGIN [ticketit_migrator] WITH PASSWORD = '$(MigratorPassword)';
  PRINT 'created login ticketit_migrator';
END
GO

IF SUSER_ID('ticketit_app') IS NULL
BEGIN
  CREATE LOGIN [ticketit_app] WITH PASSWORD = '$(AppPassword)';
  PRINT 'created login ticketit_app';
END
GO

USE [$(DbName)];
GO

-- The migrator owns the schema: it creates tables, security policies, the
-- sequence, the trigger and the predicate functions.
IF USER_ID('ticketit_migrator') IS NULL
  CREATE USER [ticketit_migrator] FOR LOGIN [ticketit_migrator];
ALTER ROLE db_owner ADD MEMBER [ticketit_migrator];
GO

-- The application reads and writes rows. No DDL.
IF USER_ID('ticketit_app') IS NULL
  CREATE USER [ticketit_app] FOR LOGIN [ticketit_app];
ALTER ROLE db_datareader ADD MEMBER [ticketit_app];
ALTER ROLE db_datawriter ADD MEMBER [ticketit_app];
GO

-- Two grants the fixed roles do not cover.
--
-- EXECUTE: order numbers come from a stored procedure, because T-SQL forbids
-- NEXT VALUE FOR inside a function.
GRANT EXECUTE ON SCHEMA::dbo TO [ticketit_app];

-- Sequence rights are separate from table rights, and without this every order
-- placement fails at the point it asks for its number.
GRANT UPDATE ON OBJECT::dbo.order_number_seq TO [ticketit_app];
GO

-- ---------------------------------------------------------------------------
-- 3. What this script deliberately does not do
-- ---------------------------------------------------------------------------
--
-- No shadow database. `prisma migrate deploy` -- the only command that should
-- ever touch this environment -- does not use one. A shadow database is a
-- development concern and giving production a second database to drift is not
-- worth the convenience of running `migrate dev` against it, which nobody
-- should be doing.
--
-- No schema. `prisma migrate deploy` creates every table, index, constraint,
-- security policy, sequence, procedure and trigger. Run it next, as the
-- migrator, and then run `npm run verify:schema` to confirm the guarantees
-- Prisma does not know about survived.

PRINT '';
PRINT 'done. next:';
PRINT '  DATABASE_URL=<migrator connection string> npx prisma migrate deploy';
PRINT '  DATABASE_URL=<app connection string>      npm run verify:schema';
GO
