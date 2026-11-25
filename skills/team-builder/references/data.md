# Data

- **Test data:** use synthetic data only in tests, fixtures and CI. Use `@example.com` for email addresses.
- **Erasure or export criteria:** write tests that prove deletion or export across every store holding the data.
- **Migrations in a fix round:** schema changes go in a NEW migration; never edit one already applied to the PO's database.

## Personal data

- **Grill (Orchestrator):** record PO decisions on collected data, purpose, retention and rights (see/correct/delete/export) in the ticket.
- **Design** (`compliance` set, personal data touched): use `{security}` before building to decide classification, field/table retention, encrypted fields, non-guessable IDs, logging exclusions and DPIA need. Follow existing architect ADRs for data location/encryption/access.
- **Build:** follow Task constraints supplied by Orchestrator; load no compliance skills.
