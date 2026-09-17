# Image generation: transport size and lossless references

Updated: 2026-09-07. Scope: Generate Image in Studio and its durable executable handler.

## Incident and limits

Next's proxy previously retained only 10 MiB, although the generation route allowed
30 MiB. A larger JSON request was truncated; parsing returned null and leaked a
confusing schema error. `experimental.proxyClientMaxBodySize` and the route now
share a 30 MiB (31,457,280 bytes) transport ceiling. The route counts actual streamed
bytes, not just Content-Length, and reports readable invalid-JSON/413 errors.

This is an application transport limit, **not a verified universal OpenRouter limit**.
The public OpenRouter Nano Banana 2 endpoint metadata reported Google AI Studio as
its provider on this date. Google's inline image guide documents 20 MB for the
whole request. Our conservative Gemini inline preflight counts the entire encoded
OpenRouter JSON body against 20,000,000 bytes, after reference optimisation. The
provider may transform that payload; this check is a local safeguard based on its
published inline policy, not a measured OpenRouter hard limit. No paid boundary
probe was made. If routing changes, recheck this policy rather than assuming all
providers have the same limit.

Sources:

- [Google inline images and total request size](https://ai.google.dev/gemini-api/docs/image-understanding)
- [OpenRouter image input formats](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding)
- [Nano Banana 2 endpoint metadata](https://openrouter.ai/api/v1/models/google/gemini-3.1-flash-image-preview/endpoints)
- [Sharp WebP options](https://sharp.pixelplumbing.com/api-output/#webp)

Base64 is approximately 4/3 of raw bytes, plus JSON/text overhead. Files API and
Cloud Storage limits describe other delivery methods, not this inline request.
Do not expose private assets publicly or upload them to another API as a workaround.

## Preparation without reducing resolution

- Studio Generate Image sends the original PNG/JPEG/WebP/GIF bytes. Its previous
  automatic 1536-pixel/JPEG fallback is no longer used for this node.
- The server tries lossless WebP for static 8-bit sRGB PNG/JPEG references used in
  Gemini generation. It neither resizes nor crops; original stored assets and the
  graph are unchanged. Existing image metadata is retained.
- Use a converted copy only if its final data URL is smaller. Otherwise preserve
  the original. Already-WebP, GIF/animation, high-bit-depth and unusual colour
  spaces are not flattened or narrowed. Optimisation is best-effort, not a promise
  that every photograph becomes lighter.
- Encode sequentially with a 40-million-pixel decode ceiling, WebP's 16,383-pixel
  side ceiling and a 10-second processing timeout per eligible image. On an
  unsupported/failed conversion retain the original; the final body-size check
  still applies. Cancellation is checked before/between preparation and dispatch.
- Executable image generation requests lossless reference preparation too. Other
  analysis/refine helpers retain their existing preparation policies.
- Reference count remains four. No new node setting, port or model was introduced.
  Oversize requests fail without paid provider dispatch; no silent lossy fallback.

## Checks

Unit coverage: exact body-size boundaries, UTF-8, malformed/null JSON, false or
missing Content-Length, stream cancellation; large PNG pixel/alpha/dimension
equality, smaller-original fallback and unsupported encodings; adapter preparation
before its final size check, no request mutation, no HTTP call for oversize data.

Local transport regression (normal disposable QA account, no real generation):

```sh
IMAGE_QA_PROXY_URL=http://127.0.0.1:7310 npx playwright test e2e/image-generation-transport.spec.ts --workers=1
```

15 MiB and exactly 30 MiB must reach field validation without truncation; 30 MiB
+ 1 byte must return 413. The test intentionally supplies an invalid document ID,
so it cannot enqueue generation or touch a user's document. It signs out at the
end; the isolated QA account/workspace remains like other local HTTP fixtures.

Verified locally on 2026-09-07: 782 unit tests passed, 10 skipped, typecheck,
lint and architecture checks passed. The standalone Docker build passed; web,
generation worker and pipeline worker use the same stable local application image.
All three containers are healthy. Twenty-one adapter/encoding tests also passed
inside that image. The HTTP regression passed against localhost:3004 and the
Visual Intent proxy at 127.0.0.1:7310, including both exact 30 MiB boundaries.
Content Hub's internal readiness check returned 200 and its Runtime v2 connection
check succeeded with seven grants and five pipelines. No paid request or user
document modification was performed.

Follow-up, not implemented: scoped asset references instead of large inline upload
JSON; opt-in near-lossless encoding; provider-specific Files API delivery. None of
these may silently change source resolution or published pipeline semantics.
