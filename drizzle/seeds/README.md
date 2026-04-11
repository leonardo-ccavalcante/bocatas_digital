# Database Seeds

These SQL files populate reference data after all migrations have been applied.

## Files

| File | Description |
|------|-------------|
| `consent_templates.sql` | RGPD consent templates (Spanish). Run once after initial deployment. |

## How to apply

```bash
# Via Supabase MCP (recommended)
manus-mcp-cli tool call execute_sql --server supabase --input '{"project_id":"<id>","query":"<sql>"}'

# Or paste the SQL into the Supabase SQL editor
```
