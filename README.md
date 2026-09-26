# Ava Hotel — Sam AI Concierge Demo

A public portfolio/demo repository for **Ava Hotel**, with **Sam** as the voice concierge and a connected hotel-operations board.

> Ava Hotel is a fictional demo property. Do not use real guest PII or real hotel operational data in the public demo.

## What it demonstrates

Guest speaks to Sam → Vapi calls a protected server endpoint → Supabase stores the structured request → the operations board displays a sanitized live feed.

### Routes

- `/` — guest-facing Ava Hotel website
- `/operations` — public, read-only operations board
- `/api/public-config` — browser-safe Vapi identifiers only
- `/api/operations-feed` — sanitized public demo feed
- `/api/vapi-tool` — protected Vapi tool endpoint
- `/api/request-action` — protected operations mutation endpoint

## Security model

This repository intentionally contains **no private API keys**.

- Supabase secret/service-role credentials stay in Vercel environment variables.
- Vapi private API keys do not belong in this repository.
- Vapi's public key and assistant ID are supplied through Vercel environment variables at runtime so forks do not inherit the original account configuration.
- Raw Supabase tables have RLS enabled with no anonymous read policies.
- The public operations board reads a sanitized server-side feed rather than querying Supabase directly.
- `/api/vapi-tool` requires `VAPI_TOOL_SECRET`.
- `/api/request-action` requires `OPS_ACTION_SECRET`, unless the explicit demo-only public-write switch is enabled.

A public Vapi key is still visible to visitors at runtime by design. Restrict it in Vapi to your production origin and assistant.

## Setup

1. Fork or clone this repository.
2. Create a Supabase project and run `sql/schema.sql`.
3. Import the repo into Vercel.
4. Copy `.env.example` values into **Vercel → Project → Settings → Environments → Production**.
5. Create a Vapi assistant for Sam and a `create_service_request` custom tool.
6. Set the tool server URL to:
   `https://YOUR_DOMAIN/api/vapi-tool`
7. In Vapi, create a Custom Credential using **Bearer Token** authentication. Use the same random value as `VAPI_TOOL_SECRET`, and attach that credential to the tool.
8. Restrict the Vapi public key to your production origin and Sam assistant.
9. Redeploy Vercel.

## Environment variables

See `.env.example`.

Required production values:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `VAPI_PUBLIC_KEY`
- `VAPI_ASSISTANT_ID`
- `VAPI_TOOL_SECRET`

Optional/admin:

- `OPS_ACTION_SECRET`
- `APP_ORIGIN`
- `DEMO_ALLOW_PUBLIC_WRITES=false`

Keep `DEMO_ALLOW_PUBLIC_WRITES=false` for a public portfolio deployment. If you need a real staff workflow, add authentication rather than exposing mutation endpoints.

## Repository structure

```text
.
├── index.html
├── operations/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── config.js
├── api/
│   ├── public-config.js
│   ├── operations-feed.js
│   ├── vapi-tool.js
│   └── request-action.js
├── assets/
├── sql/
│   └── schema.sql
├── .env.example
├── .gitignore
├── LICENSE
├── package.json
└── vercel.json
```

## Reuse

The project is licensed under MIT. Forks should create their own Vapi assistant, Vapi public key, Supabase project, server credentials, and Vercel environment variables.

The original account-specific Vapi public identifier may still exist in older Git history. It is not a private credential, but rotating/restricting the public key is recommended if you want old history to be unusable.
