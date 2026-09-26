# Ava Hotel — AI Concierge Demo

A single Vercel-ready repository for the **Ava Hotel** guest experience, **Ava** voice concierge, and hotel operations workflow.

> Ava Hotel is a fictional demo property.

## Live routes after one Vercel deployment

- `/` — guest-facing Ava Hotel website
- `/operations` — hotel operations board
- `/api/vapi-tool` — Vapi `create_service_request` endpoint
- `/api/request-action` — operations-board write endpoint

## Repository structure

```text
.
├── index.html                  # Guest website (public entry point)
├── operations/
│   ├── index.html              # Operations board
│   ├── styles.css
│   ├── app.js
│   ├── config.js
│   └── README.md
├── api/
│   ├── vapi-tool.js            # Vapi → Supabase serverless endpoint
│   └── request-action.js       # Operations actions endpoint
├── sql/
│   └── schema.sql              # Supabase schema
├── tests/                      # Vapi regression suite
├── docs/                       # Prompt, settings, contracts, setup guide
├── design-reference/           # Visual reference only
├── package.json
└── vercel.json
```

## Why it is structured this way

The repository is deployed as **one Vercel project**. The guest website owns the root URL, while the operations board is a nested route. Vercel serverless functions live at the repository root under `/api`, and the Supabase dependency is declared in the root `package.json`.

## Quick deploy

1. Push the contents of this folder to the root of the GitHub repository.
2. Import that GitHub repository into Vercel.
3. Leave **Root Directory** as the repository root (`./`).
4. Deploy.
5. Confirm both `/` and `/operations` load.
6. Follow `docs/SETUP_CHECKLIST.md` to connect Supabase and Vapi.

Do not upload only the ZIP to GitHub. Unzip it first, then commit the files and folders shown above.
