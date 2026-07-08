# ADR-0005: Messaging via Chatwoot + n8n, not the app server

**Status:** Accepted

## Context

The platform needs to notify people (new registration, check-in alerts, family communications) over WhatsApp and email. Embedding a WhatsApp/email SDK directly in the Express/tRPC app server would couple delivery concerns, credentials, and retry logic into the request path, and duplicate infrastructure that already exists on the VPS (Chatwoot for omnichannel messaging, n8n for workflow automation).

## Decision

Communication delivery lives **entirely outside** the app server. Bocatas Digital **emits webhook events** (new registration, check-in alert, etc.); Chatwoot and n8n on the VPS translate those events into actual messages. No WhatsApp/email SDK in the Express/tRPC server.

- Outbound webhook retries are tracked locally in `family_webhook_log` / `announcement_webhook_log`.
- The app's responsibility ends at "emit a reliable event"; delivery semantics belong to Chatwoot/n8n.

## Consequences

- Clean separation: the app stays a data + event source; messaging infra evolves independently.
- No messaging credentials or provider SDKs in the app server's blast radius.
- Delivery failures are observable via the webhook logs, but end-to-end delivery confirmation depends on the VPS side — the app cannot assert "message delivered," only "event emitted."
- Adding a new notification = emit a new event + wire an n8n workflow, not app-server code.
