# Next.js route handlers + streaming (from bundled docs)

Source: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
(Next.js 16.2.10 — docs bundled with the pinned version). Fetched locally 2026-07-13.

## Route handlers
- `app/api/**/route.ts` exports `GET`/`POST`/… receiving a Web `Request` (or
  `NextRequest`).
- Read JSON body: `const body = await request.json()`.
- Segment config: `export const runtime = 'nodejs'` (Node runtime — required for AWS
  SDK).

## Streaming responses
Return a Web `ReadableStream` wrapped in a `Response` (verbatim pattern from docs):

```ts
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()
      if (done) controller.close()
      else controller.enqueue(value)
    },
  })
}
export async function GET() {
  return new Response(iteratorToStream(makeIterator()))
}
```

## Abort handling
`request.signal` (standard Web Request API) is an `AbortSignal` that fires when the
client disconnects/aborts the fetch. Pass it through to the Bedrock
`client.send(command, { abortSignal })` call so the upstream stream is terminated.
(SDK v3 `send` accepts `{ abortSignal }` as HttpHandlerOptions — smithy types in the
pinned SDK: node_modules/@smithy/types/dist-types/http.d.ts.)
