# Data

- **Test data:** use synthetic data only in tests, fixtures and CI. Use `@example.com` for email addresses.
- **Erasure or export criteria:** write tests that prove deletion or export across every store holding the data.
- **Migrations in a fix round:** schema changes go in a NEW migration; never edit one already applied to the PO's database.

## Personal data

- **Grill (Orchestrator):** when a capability collects it, ask the PO and record in the ticket: what is collected, the purpose, retention, users' rights (see, correct, delete, export).
- **Design** (`compliance` set and the work touches personal data): decide before building, using the `{security}` slot skills as reference: data classification, retention per field or table, encrypted fields, non-guessable identifiers, what is never logged, whether a DPIA is needed. System-level choices (where personal data lives, encryption, access model) come from the Solution Architect ADR when one exists.
- **Build:** the Orchestrator puts these constraints in the Task spec; Builders do not load compliance skills.
