# Models management

Implemented in the M2 preview, 19 October 2026. The sidebar Models page owns provider and
model configuration. Settings retains appearance, workspace, runtime and layout preferences.

## Workflow

1. Add a named provider under **Providers**. Multiple connections of the same kind can coexist.
   OpenRouter uses its official endpoint. Custom compatible supports HTTPS endpoints and HTTP
   loopback servers. Keys remain encrypted in backend storage and are never returned to the UI.
2. **Test connection / Refresh models** retrieves `/models`. This does not generate model output.
   Connection success does not establish tool support. Failed refreshes retain cached models and
   display an error. Catalogs are refreshed explicitly, without background polling.
3. In **Model Catalog**, search/filter, favorite models, and enable **Show in chat**. Open a row
   for capabilities and parameter defaults. Models advertising no tools cannot be used for coding.
   Missing capabilities remain unknown until tested. A manual ID is available when discovery is
   unsupported; it does not invent effort choices, prices or context limits.
4. **Test model** makes an explicit streaming/tool request using saved options. It can incur
   provider costs. A model must pass before sending an agent task. Endpoint/key changes invalidate
   verification; disabling a connection removes its models from the available chat choices.
5. Set **Defaults** for newly created sessions, or choose a model directly in chat. The picker
   lists enabled models directly and sorts favorites before recent models. Catalog search stays on
   the Models page. Recent ordering is a browser-local
   workspace preference. Model and effort selection persist in SQLite per session.

The composer shows a value such as **Default** or **High**, without a visible Reasoning label.
Its accessible name and tooltip identify the control. It appears only when the model advertises
effort choices. Mandatory reasoning omits Off. Default sends no explicit effort; provider defaults
apply. Unsupported selections are rejected by the backend. When refreshed metadata removes an
effort, the UI returns to Default. Explicit effort replaces a saved token budget for that task.

Model details store maximum output tokens, supported temperature and optional reasoning budget.
An explicit budget is offered only when advertised and must be below the output limit. A model's
saved effort seeds the picker when choosing that model and the Defaults form; existing session
selections remain independent. Catalog prices normalize to USD per million tokens; unknown prices
stay unknown. Provider billing remains authoritative.

## Structure and persistence

| Module                                    | Responsibility                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `packages/shared/src/models.ts`           | Public schemas, effort validation and labels                             |
| `packages/core/src/providers/adapters.ts` | Catalog parsing, SDK model factories, provider options                   |
| `packages/core/src/providers/store.ts`    | Versioned configuration, encrypted credentials, preferences and defaults |
| `packages/core/src/providers/catalog.ts`  | Bounded discovery requests and redacted failure states                   |
| `packages/core/src/providers/model.ts`    | Model construction and streaming/tool capability probe                   |
| `apps/server/src/models.ts`               | Authenticated routes and per-connection check locks                      |
| `apps/web/src/features/models/`           | Providers, catalog, details, defaults and composer picker                |

The adapter registry separates provider-specific request mapping from UI and the agent loop.
OpenRouter uses `reasoning.effort` / `reasoning.max_tokens`; compatible endpoints use
`reasoning_effort` and explicit budget passthrough when advertised. Compatible catalogs may provide
the OpenRouter-style metadata fields; a standard `{data: [{id}]}` catalog remains valid, with
unknown capabilities. Adding another provider kind requires its schema, adapter and connection form
entry; it does not require another settings page or agent implementation.

`provider.json` version 2 stores connections and cached models. Existing single-provider settings
migrate lazily, preserving encrypted secrets, the default model, and completed verification. Public
snapshots strip secret fields. Changing a destination never transfers its credential. Stale check
responses cannot verify an edited connection. SQL migration `0003_model_selection.sql` adds session
selections without changing applied migrations. The legacy singleton API remains for existing clients.

Generation captures credentials, SDK model, output settings and effort at task start. Changes made
while that task is running affect subsequent tasks only. Session model events use the existing
persisted SSE channel. They update selectors without restarting generation or replaying tools.

## Verification

Deterministic tests cover encrypted legacy migration, two connections using the same model ID,
catalog refresh/failure and preference retention, output/effort validation, secret redaction,
workspace isolation, per-session persistence/defaults, and a running task surviving endpoint/model
changes. Adapter tests inspect the actual outgoing request for explicit effort and Default omission.
Composer rendering tests check supported options, mandatory reasoning and the value-only label.

Browser smoke tests use `tests/fixtures/m2-preview.ts` so capability probes and coding tasks incur
no provider charges. The public OpenRouter catalog is also checked read-only. These checks do not
claim live generation validation for every catalog model or compatible endpoint.

References: [OpenRouter model metadata](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties),
[reasoning controls](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).
