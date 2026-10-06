export interface RecordedCall {
  readonly url: string;
  readonly init: RequestInit;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

export type Responder =
  Response | Error | DOMException | ((call: RecordedCall) => Response | Promise<Response>);

/** Scripted fetch: answers with queued responders in order and records every call. */
export class FakeFetch {
  readonly calls: RecordedCall[] = [];
  readonly #queue: Responder[];

  constructor(...responders: Responder[]) {
    this.#queue = [...responders];
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const call = { url: String(input), init: init ?? {} };
    this.calls.push(call);
    const next = this.#queue.shift();
    if (next === undefined) throw new Error(`Unexpected fetch call to ${call.url}`);
    if (typeof next === 'function') return next(call);
    if (next instanceof Response) return next;
    throw next;
  };
}
