# Sample incident history

Synthetic incident exports for trying MIRA: 10 monthly CSV files (Dec 2025 – Sep 2026) for each sector.

| Folder | Sector | Files | Incidents |
|---|---|---|---|
| `fintech/` | Fintech (payments, UPI, banking) | 10 | ~80 |
| `ecommerce/` | E-commerce (checkout, search, delivery) | 10 | ~75 |
| `edtech/` | EdTech (classes, exams, results) | 10 | ~80 |

Problems recur across months with the same failed fixes, so MIRA can learn real patterns. A few rows contain card numbers, UPI IDs, phone numbers and emails, so you can see MIRA hide them on import.

## How to use

1. Sign up and choose the matching sector.
2. Open **Data sources** and drop in all 10 files from that sector's folder.
3. Go to the **Console** and ask about an outage.

Columns: `id, title, service, category, alert, root cause, failed fixes, fix, resolved by, minutes, date`. Multiple failed fixes are separated by `;`.

To regenerate the files: `node sample-data/generate.mjs`.

All companies, people and incidents here are made up.
