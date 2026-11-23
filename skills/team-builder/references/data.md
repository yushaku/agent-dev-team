# Data

- **Test data:** use synthetic data only in tests, fixtures and CI. Use `@example.com` for email addresses.
- **Erasure or export criteria:** write tests that prove deletion or export across every store holding the data.
- **Migrations in a fix round:** schema changes go in a NEW migration; never edit one already applied to the PO's database.
