# LLM Provider Playbooks (Anthropic · OpenAI · Gemini)

All providers are wrapped behind provider adapters in `packages/ai`. Business logic never
couples to provider-specific objects. The Model Router selects per subtask by type, budget,
latency, and policy; fail over after one provider failure.

## Anthropic (default)
- Messages API, tool use, MCP connectivity, prompt caching, rate-limit awareness.
- Cache candidates: constitution, DNA rules, tool definitions, repeated large contexts.
- Default provider for Claude Code-driven development and architecture planning;
  the runtime product remains provider-agnostic.

## OpenAI
- Forward path: **Responses API** (stateful interactions, built-in tools, file/web search,
  computer use, function calling). Assistants API is deprecated in its favor.
- Vector stores / retrieval APIs available; project-specific rate limits.
- Use via Model Router where its tool ecosystem or performance profile wins.

## Gemini
- Rate limits depend on usage tier — read from AI Studio, never hardcode.
- Batch API has dedicated limits; project and key restrictions apply in AI Studio.
- Prefer **stable model aliases** over previews for production routing.
- Treat as secondary provider for price/latency-attractive workloads.
