# Personal data

- **In the spec:** when a capability collects it, state as business rules what is collected, the purpose, retention, and users' rights (see, correct, delete, export); the PO decides at Gate 1.
- **In the design** (`compliance` set and the work touches personal data): decide at design time, using the `{security}` slot skills as reference: data classification, retention per field or table, encrypted fields, non-guessable identifiers, what is never logged, whether a DPIA is needed. System-level choices (where personal data lives, encryption, access model) come from the Solution Architect ADR when one exists. Put the constraints into each Builder Task spec; Builders do not load compliance skills.
