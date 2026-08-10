# Project Instructions

## Architecture

* Keep route handlers thin; they should authenticate, validate, call a domain service, and format the response.
* Keep provider-specific behavior inside provider adapters.
* Keep database queries inside repository modules.
* Keep orchestration logic outside repositories and UI components.
* Keep shared protocol schemas independent from both the web app and worker implementation.
* Avoid circular imports between agent, tool, provider, persistence, and UI layers.

## File Organization

* Prefer focused files with one primary responsibility.
* Split files when they mix protocol definitions, persistence, business logic, and presentation.
* Do not create generic `utils.ts` dumping grounds.
* Name shared helpers by domain, such as `run-events.ts` or `worker-leases.ts`.
* Keep tool manifests, executors, and permission policies in separate modules.
* Keep components close to the feature that owns them unless they are genuinely reused.

## Workflow

* Use subagents whenever possible.
* For delegated exploration and implementation, prefer `gpt-5.6-luna` with maximum reasoning effort (`xhigh`). Keep delegated write scopes disjoint and review their changes before integration.
* Never try to verify the UI or functionality with a browser or screenshot.
* Always push to `main` when done.
* Once tests pass, always apply pending database migrations to the local homelab server and verify with the migration check before considering the task complete.

## Homelab

Applications in this workspace may be deployed to the single-user Lubuntu server named `homelab`.

* SSH: `evanh@100.98.43.68`
* Private homelab URL: `https://homelab.tail861ffd.ts.net`

Use the local workspace for code changes, tests, commits, and pushes. Use passwordless SSH for deployment and server inspection:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 evanh@100.98.43.68 "<command>"
```

Service-specific checkouts, deployment files, container names, ports, and data paths vary by application. Inspect the target service's deployment configuration on `homelab` before making changes, and keep each service's data isolated from the others.
