# AWS Costs TUI Plan

## Goals
- Provide a spreadsheet-like, hierarchical costs view (service -> resource) with expandable rows.
- Support quick range switching: past 24 hours, 7 days, 30 days; keep design extensible for more ranges.
- Read-only, fast, and keyboard-first, consistent with existing Ink UI patterns.

## Views & Navigation
- **Service tree**: rows show service name, total cost for selected range, % of overall, optional delta vs previous period. Right arrow expands to resources; left arrow collapses.
- **Resource rows**: show resource identifier (or tag-derived name), cost, % of service, usage type/operation, and key tags. Sortable by cost and name.
- **Range selector**: cycle ranges with `g` (or similar); show active range in header. Precompute totals per range to avoid recomputation when toggling.
- **Detail pane (optional split view)**: when a row is selected, show a small trend sparkline and last-updated time; could reuse existing component patterns.
- **Filtering**: text filter by service/resource name or tag; quick toggle to hide zero-cost rows.
- **Refresh**: `r` to refetch for current range; show throttle/backoff status.
- **Org/account scope indicator**: display current AWS profile/role/region/account IDs in header.

## Data & API Notes
- Primary source: AWS Cost Explorer `GetCostAndUsage`.
  - 24h: use `Granularity=HOURLY` (limited to last 14–15 days).
  - 7d/30d: `Granularity=DAILY`.
  - Groupings: first by `DIMENSION: SERVICE`, then by `DIMENSION: USAGE_TYPE` or `OPERATION`. For resource-level drill, consider `DIMENSION: RESOURCE_ID` (supported for some services) or `TAG:<key>` for consistent tagging.
- Totals: show summed amount and unit (likely USD). Include handling for blended vs unblended; default to unblended.
- Caching: cache per-range results in memory for session; reuse when toggling ranges if not stale.
- Error handling: clear messaging for Cost Explorer throttling (1 TPS soft limit), missing permissions (`ce:GetCostAndUsage`), or unsupported granularities.

## UX / Ease-of-use ideas
- Footers with grand total and selected-row path (e.g., `EC2 > i-1234`).
- Shortcut to expand/collapse all services.
- Option to toggle showing taxes/credits/refunds.
- Indicate data currency window (e.g., “data delayed up to 24h by AWS”).
- Optional CSV/TSV export of the current view (write to file locally).

## Obstacles / Risks
- **Resource granularity gaps**: `RESOURCE_ID` is only available for some services; others require consistent tagging. If tags are missing, “per resource” may be impossible—may need Cost & Usage Report (CUR) or custom mapping.
- **Recent data freshness**: AWS can lag; last 24h may be incomplete. Need to surface staleness.
- **Rate limits**: Cost Explorer throttles quickly; batching ranges or aggressive pagination may be needed.
- **Large orgs**: Many services/resources can bloat the tree; consider pagination or lazy loading per expanded node.
- **Currency/formatting**: Multi-currency orgs or non-USD accounts need explicit handling; assumptions must be stated.

## Open Questions (please confirm)
- Account scope: single account vs AWS Organizations (consolidated billing)? Need to aggregate linked accounts?
- Source of resource identity: are tags (e.g., `Name`, `Service`, `Env`) consistent enough to present as resource labels? Is CUR available if Cost Explorer resource granularity is insufficient?
- Preferred cost type: unblended vs blended vs amortized/RI/SP? Include credits/taxes/fees?
- Which region(s) to assume? Should UI allow region filters?
- Should deltas vs previous period be shown? If yes, which comparison windows?
- Are CSV exports desired from the TUI?
- Any performance constraints for refresh frequency, or is a manual refresh key sufficient?

## Implementation Outline
- Dependencies/config: add Cost Explorer client package; thread profile/region through the client factory; feature-flag the costs view if Cost Explorer permissions are missing.
- Navigation: extend `ServiceView`/router to include `costs`; add a Home card for Costs. Reuse existing back/forward handling and region/profile headers.
- State: create a `costs` slice storing selected range, expanded node IDs, filter text, hide-zero toggle, cached results per range, last-updated timestamp, loading/error status, and throttle/backoff hints.
- Data service: wrap `GetCostAndUsage` with range presets (24h/7d/30d), normalized money values, and grouping adapters (service-only, service→resource via `RESOURCE_ID` or `TAG:<key>`). Cache per-range responses and return stale-but-usable data while refreshing.
- UI: tree view with rows for service/resource, showing amount, percent-of-total, and optional delta. Support expand/collapse all, text filter, hide-zero toggle, and a detail pane with sparkline + timestamp when focused.
- Keyboard: `g` (cycle ranges), `r` (refresh), arrows/jk to move, `→/←` to expand/collapse, `a` (expand all), `z` (toggle zero rows), `/` to focus filter input, `Esc` to clear filter/close detail.
- Errors/limits: surface throttling/backoff, missing permissions, and data-staleness messaging in the header/footer.
- Tests: Vitest coverage for data shaping (aggregation, percentages, currency), caching and range toggling behavior, sort/filter logic, and view-level keyboard handling.
