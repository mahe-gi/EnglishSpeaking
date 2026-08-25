# Database & Prisma Rules
<!-- glob: backend/prisma/** -->

## Stack & Migrations
- PostgreSQL (Neon) + Prisma ORM.
- All schema changes must use Prisma migrations (`npx prisma migrate dev`).
- Never alter production database schema manually.
- Direct Prisma usage inside module services (no custom repository layer).

## Invariants & Data Integrity
- Maintain unique constraints on `User.firebaseUid` and `User.email`.
- Store all timestamps in UTC.
- Enforce relational foreign keys and cascade deletions where appropriate.
- JSONB columns are used only for extensible metric/feedback payloads during MVP.
