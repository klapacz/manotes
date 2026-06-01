---
title: Alchemy Cloudflare deployment
date: 2026-06-07
type: shipped
tags:
  - cloudflare
  - alchemy
  - deploy
---

## Summary

Moved the Cloudflare worker and web deployment from Wrangler/Vite Cloudflare integration to an Alchemy-managed stack. The stack now provisions the API worker, Durable Objects, KV-backed auth services, email binding, and production web domain through Alchemy.

## The Why

The previous setup split local web dev, worker dev, bindings, Durable Object declarations, routes, and deploy behavior across Wrangler config, Vite config, generated worker types, and package scripts. That made the deployment boundary hard to evolve as the worker started owning more backend infrastructure.

Alchemy gives the project one Effect-native place to define Cloudflare resources and the runtime bindings used by the worker services. It also lets the web app and API worker deploy together while keeping local development explicit: web runs on Vite, the API runs on a local Alchemy worker, and the web dev server proxies `/api` to the worker.

## Design Decisions

The worker entrypoint is now an Alchemy `Cloudflare.Worker` resource instead of a Wrangler default export. Runtime services resolve Cloudflare resources through Alchemy bindings rather than a custom `Worker.Env` context, so auth, session KV, OTP KV, Send Email, and Durable Object namespaces are injected as Effect services.

Durable Objects were converted from `cloudflare:workers` classes with `ManagedRuntime` fields to Alchemy Durable Object namespaces. Each object builds the minimal SQL/runtime layer around `DurableObjectState`, runs migrations under `blockConcurrencyWhile`, and exposes Effect-backed methods for RPC, session/account lookup, and websocket sync.

The deploy script now targets the production Alchemy stage explicitly with `.env.prod` and `--stage prod`. Production attaches `manotes.dev` for the web app and `manotes.dev/api*` for the API worker; non-production stages avoid hard-coded public domains by default.

The web package no longer uses the Cloudflare Vite plugin. Local web development proxies API and websocket traffic to the worker on port `3000`, while the worker Alchemy dev task runs separately and the top-level process compose starts the stack through the worker task.

A small Alchemy patch is carried to support Cloudflare Worker routes until that capability is available upstream. The patch is isolated as a pnpm patched dependency so it can be removed once Alchemy provides route reconciliation directly.
