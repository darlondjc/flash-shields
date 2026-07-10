import type { IncomingMessage, ServerResponse } from 'node:http';

// Subconjunto mínimo de VercelRequest/VercelResponse (o runtime Node da
// Vercel injeta esses campos em cima do IncomingMessage/ServerResponse
// padrão) — definido localmente pra não depender do pacote @vercel/node
// inteiro só pelos tipos, que traz binários nativos pesados (lmdb,
// @parcel/watcher) só usados pelas ferramentas de dev/build da Vercel, não
// em runtime, e cujos install scripts vinham quebrando o build na Vercel.
export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[] | undefined>;
}

export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  send(body: string | Buffer): VercelResponse;
}
