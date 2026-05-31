# Official Toronto Data Cache

This directory is the local/DGX cache for official-source RAG and fine-tuning prep.

Run:

```bash
npm run fetch:toronto-data
```

The fetcher writes:

- `catalog/`: CKAN package metadata from the City of Toronto Open Data API.
- `raw/`: selected official CSV, JSON, GeoJSON, ZIP, or XLSX resources.
- `pages/`: official City/Ontario/TTC/Metrolinx HTML pages for RAG extraction.
- `manifest.json`: fetch timestamp, source URLs, byte counts, SHA-256 hashes, and errors.

These generated files are intentionally ignored by Git. Keep the source manifest logic in the repo, but store large data on the DGX or local machine that runs training.

Only official sources should be added here unless the source policy changes.
