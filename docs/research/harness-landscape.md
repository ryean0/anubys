# Agent and model harness landscape

Snapshot for the static site in this repository. Researched 12 October 2026 from public docs and vendor posts. Product code for the regression gate lives elsewhere. This file is background for the Integrations section. It is not a claim that any of these projects integrate with the gate.

A **harness**, in the sense these projects now use, is the runtime around a model: the loop, the tools, the permissions, the memory, and the place a trace is recorded. A **regression gate** is a different object. It runs two versions of an agent on the same scenarios and returns one suite status. The gate should sit outside the harness, behind a thin adapter, so the verdict does not depend on which SDK ran.

## Agent SDKs

**OpenAI Agents SDK** (Python and TypeScript) is the production successor to the Swarm experiment. The primitives are small: an `Agent` with instructions and tools, a runner (`Runner.run` in Python, `run` in TypeScript), handoffs, guardrails, sessions, and built-in tracing. Sandbox agents add an isolated filesystem. The TypeScript package is `@openai/agents` and uses Zod for tool schemas. State can live in the application, in a session you store, or in OpenAI-managed continuation (`conversation_id` / `previous_response_id`).

- [OpenAI Agents SDK for Python, quickstart](https://openai.github.io/openai-agents-python/quickstart/)
- [OpenAI Agents SDK for TypeScript](https://openai.github.io/openai-agents-js/)
- [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents)

**Claude Agent SDK** (Python `claude-agent-sdk`, TypeScript `@anthropic-ai/claude-agent-sdk`) embeds the Claude Code agent loop: built-in file and shell tools, permissions, hooks, subagents, sessions, skills, and MCP. `query()` is the one-shot entry; `ClaudeSDKClient` keeps a session. Anthropic’s own write-up of dynamic workflows says Claude can write a fresh harness per task (a script that fans work out across subagents) instead of one static loop for every job.

- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)
- [A harness for every task](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)

**LangGraph** is the low-level orchestration runtime in the LangChain stack: durable execution, checkpoints, streaming, and human-in-the-loop interrupts. LangChain’s higher-level agents sit on that runtime. The official overview is explicit that LangGraph does not require LangChain. A secondary 2026 writeup describes `create_agent` as the current high-level API and raw `StateGraph` as the escape hatch for custom topology; treat the version chronology in that post as secondary, and the overview as the product definition.

- [LangGraph overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [LangChain in production (secondary, March 2026)](https://ilirivezaj.com/ai/langchain-production)

**LlamaIndex** offers prebuilt agents (`FunctionAgent`, `ReActAgent`, `CodeActAgent`, `AgentWorkflow`) and a Workflows library of typed steps with a per-run `Context` that can be snapshotted and restored. Durability is either an application checkpoint loop or a runtime plugin (their docs use DBOS as the example). Workflows can be installed on its own (`llama-index-workflows`).

- [Building an agent](https://developers.llamaindex.ai/python/framework/understanding/agent/)
- [Workflows](https://developers.llamaindex.ai/python/llamaagents/workflows/)
- [Durable workflows](https://developers.llamaindex.ai/python/llamaagents/workflows/durable_workflows/)

**CrewAI** still has crews (role, goal, task, sequential or hierarchical process) and now pushes **Flows** as the production shell: event-driven steps, explicit state, and `@persist` so a run can resume. Their production guide says to start with a Flow and call a Crew only for a focused delegated task.

- [Flows](https://docs.crewai.com/edge/en/concepts/flows)
- [Production architecture](https://docs.crewai.com/edge/en/concepts/production-architecture)

**AutoGen** is in maintenance mode. The project readme tells new users to start with **Microsoft Agent Framework**, and limits AutoGen contributions to bug fixes, security patches, and docs. Agent Framework 1.0 is the production successor, combining Semantic Kernel and AutoGen: multi-agent orchestration (sequential, concurrent, handoff, group chat, Magentic-One), checkpointing, human approval, and interoperability via A2A and MCP. A migration guide is published. The 1.0 announcement describes stable APIs and long-term support; the release-candidate post is dated 2 March 2026.

- [microsoft/autogen](https://github.com/microsoft/autogen)
- [Microsoft Agent Framework 1.0](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/)
- [AutoGen migration guide](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/agent-framework/migration-guide/from-autogen/index.md)
- [Release candidate, 2 March 2026](https://devblogs.microsoft.com/agent-framework/migrate-your-semantic-kernel-and-autogen-projects-to-microsoft-agent-framework-release-candidate/)

## Tools and traces

**Model Context Protocol** is the tool and resource plane these SDKs are growing into. Claude Agent SDK, Microsoft Agent Framework, Inspect, and LlamaIndex docs all speak MCP. Specification `2026-07-28` is a dated release: tools (`tools/list`, `tools/call`), resources, a stateless protocol core, method and tool names repeated in `Mcp-Method` and `Mcp-Name` headers so a gateway can route without parsing the body, cache hints on list and read results, and an extensions framework. Tier 1 SDKs called out for that revision are TypeScript, Python, Go, and C#.

- [MCP tools, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP resources, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
- [Spec post for 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2026-07-28-spec-ga/index.md)

**OpenTelemetry GenAI semantic conventions** are the attempt at a shared trace shape: spans for inference, embeddings, retrieval, `invoke_agent`, `execute_tool`, and related operations, with `gen_ai.operation.name` and `gen_ai.request.model`. They are still **Development**, not stable. In May 2026 the conventions moved into a satellite repo (`open-telemetry/semantic-conventions-genai`) that extends the core semantic conventions and also covers MCP. The same span ids are present in core semantic conventions at v1.41.0, still marked development. Attribute names can still change. A gate can attach these spans as diagnostics. It should not treat them as the verdict.

- [GenAI semantic conventions repo](https://github.com/open-telemetry/semantic-conventions-genai)
- [GenAI spans (generated docs)](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md)
- [Core spans.yaml at v1.41.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.41.0/model/gen-ai/spans.yaml)

## Eval tools

These tools measure prompts, traces, or tasks. Several already fail a CI job. None of them is the paired suite verdict this gate defines (non-inferiority, δ = 5 pp: Pass when the 90% interval's lower bound is above −5 pp, Block when its upper bound is below −5 pp, otherwise insufficient evidence, and an invalid run isn't scored).

**Inspect AI** (UK AI Security Institute, with Meridian Labs named on the project home page) is a code-first eval framework. A task is a dataset, a solver, and a scorer. It runs tool-using agents in sandboxes and can drive external agents such as Claude Code, Codex CLI, and Gemini CLI. The changelog’s 0.3.277 entry is dated 6 October 2026.

- [Inspect](https://inspect.aisi.org.uk/)
- [Tutorial](https://inspect.aisi.org.uk/tutorial.html)
- [Changelog](https://inspect.aisi.org.uk/CHANGELOG.html)

**promptfoo** is a YAML and CLI eval and red-team runner. It has a GitHub Action that evaluates prompt changes on a pull request and can post results. Its CI guide also shows `npx promptfoo eval` writing `results.json`. That filename collides with this gate’s results file; the schemas are not the same. On 9 March 2026 OpenAI announced an agreement to acquire promptfoo and fold the technology into Frontier. Both announcements say closing is subject to customary conditions, and promptfoo says the open-source project stays multi-provider. Do not describe that deal as closed.

- [promptfoo GitHub Action](https://www.promptfoo.dev/docs/integrations/github-action/)
- [promptfoo CI/CD](https://www.promptfoo.dev/docs/integrations/ci-cd/)
- [OpenAI announcement, 9 March 2026](https://openai.com/index/openai-to-acquire-promptfoo/)
- [promptfoo announcement, 9 March 2026](https://www.promptfoo.dev/blog/promptfoo-joining-openai/)

**LangSmith** is LangChain’s hosted tracing and evaluation product. An experiment is a dataset, a target function, and evaluators (including the open-source `openevals` judges in the quickstart). It is the natural place a LangGraph app already sends traces. It is an observability and experiment store, not a required-check contract by itself.

- [Evaluation quickstart](https://docs.langchain.com/langsmith/evaluation-quickstart)

**Braintrust** runs evals in CI through `braintrustdata/eval-action` (a pull-request comment with scores) or `bt eval` on other runners. The docs describe a proxy that can cache repeated model calls. That is the same cost problem record/replay cassettes are meant to answer, solved inside their hosted stack.

- [Run experiments in CI/CD](https://www.braintrust.dev/docs/evaluate/run-in-ci)
- [braintrustdata/eval-action](https://github.com/braintrustdata/eval-action)

**DeepEval** is pytest-native. `assert_test()` plus `deepeval test run` fails the build when a metric fails. It instruments agent traces, including a tracing processor for the OpenAI Agents SDK and integrations for LangGraph, LlamaIndex, and CrewAI. That makes it the closest thing in this list to a library you drop into an existing Python CI job.

- [Unit testing in CI/CD](https://deepeval.com/docs/evaluation-unit-testing-in-ci-cd)
- [OpenAI Agents integration](https://deepeval.com/integrations/frameworks/openai-agents)

## GitHub Actions

A check created by a workflow job is a required pull-request check only when the workflow runs on an eligible event. For a pull request that is `pull_request` (plus `merge_group` if the repository uses a merge queue). `workflow_dispatch` on a pull-request branch does not satisfy the requirement. The job name is the check name branch protection will look for, so a gate needs a stable job name. A reusable step is a composite action (`action.yml`), either in-repo or published to another repository. This repository’s workflow deploys the static site. It is not the regression-gate action.

- [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
- [Creating a composite action](https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-composite-action)

## Where this is heading

1. **The harness is splitting into a small loop plus a durable graph.** OpenAI and Anthropic ship a loop (agent, tools, handoffs, permissions). LangGraph, LlamaIndex Workflows, CrewAI Flows, and Microsoft Agent Framework ship the graph: checkpoints, interrupts, resume. Anthropic is also letting the model write a one-off harness when the static loop is the wrong shape. A regression gate that imports one of these SDKs will be obsolete on the next rename. AutoGen’s move into maintenance mode is the recent example.

2. **Tools are converging on MCP. Traces want to converge on OpenTelemetry and are not there yet.** MCP has dated spec releases and several first-party SDKs. OTel GenAI spans exist and are still Development, in their own repo. Plan to read traces as an optional diagnostic. Do not block a suite status on a particular attribute name.

3. **Evals are moving into the pull request, and some of them are moving into the model vendor.** promptfoo, Braintrust, and DeepEval already fail or comment on a PR. OpenAI has agreed to buy promptfoo, subject to closing. Vendor evals will be convenient and provider-shaped. An independent gate still has a job: the same scenarios, two arms, one statistical call, and an invalid run when the sample cannot support a call.

4. **Cost control is record/replay, under several names.** promptfoo caches model calls in CI. Braintrust’s proxy caches them too. A cassette keyed by a hash of each model request is the provider-agnostic version of that idea. Cassette replay is Built. You need your own recording first. No sample recording ships.

5. **The adapter is the stable seam.** Each SDK’s run function is different (`Runner.run`, `query()`, `graph.invoke`, `kickoff`, a Flow). The contract that can stay still is narrower than any of them: one scenario in, one scored rollout out, then a results file the page already knows how to read (version `1`, `2.0.0`, or `2.1.0`).

## What this repository should and should not say

Shipped here: a static page and a results reader for results.json version `1` and `2.x.y` (the 2.0.0 caption revision and the 2.1.0 model-id and gate-settings revision). The reader is the contract the page enforces. It is not an adapter, an Action, or a cassette player.

The first backend the harness is being built against is **a pinned Gemini Flash-Lite model id (exact version set in suite config)**. That version is not final. A floating alias is not the pin, because it moves. The site labels this adapter **in progress** until it merges. It is not an official Google partnership, and the suite verdict still does not depend on the provider. OpenAI Agents SDK, Claude Agent SDK, and the other framework wrappers are **roadmap adapter examples**, not backends in development.

- [Gemini models and version name patterns](https://ai.google.dev/gemini-api/docs/models)

Not shipped here, and labeled on the page as **planned** or **roadmap adapter example**: the GitHub Action and wrappers for the other SDKs and eval tools above. Cassette replay is Built. No official partnerships. The page does not name GPT-4.1-nano.
