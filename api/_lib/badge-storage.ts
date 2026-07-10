import { put } from '@vercel/blob';

// Baixa o escudo original da TheSportsDB (server-side, sem restrição de CORS)
// e sobe pro Vercel Blob num path estável (addRandomSuffix: false +
// allowOverwrite: true, pra um novo sync sobrescrever a mesma URL em vez de
// acumular blobs órfãos). URLs do Vercel Blob já são servidas com CORS
// liberado, então o client consegue fazer fetch/blob delas direto — sem
// precisar de uma rota de proxy própria. Devolve a URL pública, ou undefined
// se a liga/time não tiver escudo de origem ou o download falhar — nesses
// casos o Firestore fica sem badgeUrl e a rota de leitura simplesmente não
// expõe escudo.
export async function uploadBadge(path: string, sourceUrl: string | undefined): Promise<string | undefined> {
  if (!sourceUrl) return undefined;

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    console.warn(`uploadBadge: falha ao baixar ${sourceUrl} (${response.status})`);
    return undefined;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? 'image/png';
  const blob = await put(path, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}
