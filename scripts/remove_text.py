#!/usr/bin/env python3
"""
remove_text.py - Remove letras/palavras de escudos de times, preenchendo o buraco
com o fundo que deveria estar ali (inpainting).

Lida com texto em qualquer posição/ângulo porque o detector (CRAFT, via EasyOCR)
devolve polígonos de 4 pontos rotacionados, não retângulos alinhados. Sucessor do
antigo paddle_detect_blur.py (PaddleOCR + blur retangular) -- comparado lado a
lado nos mesmos escudos, detectou/removeu texto arqueado ("BLACKBURN ROVERS",
"MANCHESTER") que o PaddleOCR simplesmente não enxergava, e o resultado é limpo
(remoção + reconstrução do fundo) em vez de borrado.

Uso interativo:
    python remove_text.py escudo.png -o limpo.png
    python remove_text.py escudo.png -o limpo.png --dilate 5 --debug
    python remove_text.py pasta/ -o saida/          # lote

Uso pelo game-badges.mjs (subprocess, um arquivo por vez):
    python remove_text.py <input> -o <output>
    Imprime uma linha JSON em stdout no final: {"regionsFound": N}. Todo o
    resto (progresso, avisos) vai pro stderr -- mesmo contrato que o
    paddle_detect_blur.py tinha.

Instalação:
    pip install -r requirements.txt   # (na raiz de scripts/)
"""

import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np

IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


# --------------------------------------------------------------------------- #
# Detecção
# --------------------------------------------------------------------------- #
_reader = None


def get_reader(langs=("en",), gpu=False):
    global _reader
    if _reader is None:
        import easyocr
        _reader = easyocr.Reader(list(langs), gpu=gpu, verbose=False)
    return _reader


def detect_text_polygons(img_bgr, langs=("en",), gpu=False,
                         upscale=2, text_threshold=0.6, low_text=0.3):
    """Devolve polígonos de texto (lista de arrays 4x2 na escala original).

    Usa reader.detect(), NÃO readtext(). A confiança do readtext é a do
    RECONHECIMENTO, e texto em arco é ilegível para o reconhecedor -> confiança
    ~0.05 -> caixas boas seriam descartadas. Aqui só interessa ONDE está o
    texto, não o que ele diz.

    detect() devolve duas listas: horizontal_list (retângulos) e free_list
    (quadriláteros rotacionados, que é o que aparece em texto inclinado/curvo).
    """
    reader = get_reader(langs, gpu)

    big = (img_bgr if upscale == 1 else
           cv2.resize(img_bgr, None, fx=upscale, fy=upscale,
                      interpolation=cv2.INTER_CUBIC))

    horizontal, free = reader.detect(
        cv2.cvtColor(big, cv2.COLOR_BGR2RGB),
        text_threshold=text_threshold,
        low_text=low_text,
        link_threshold=0.4,
        width_ths=0.3,
        height_ths=0.7,
    )

    # CRAFT ocasionalmente "engorda" um polígono até cobrir metade do escudo
    # (ou até estourar a borda da imagem) -- não é texto nenhum, é ruído do
    # detector. Uma região de texto legítima (mesmo um arco inteiro) não
    # deveria se aproximar do tamanho da imagem inteira; descarta antes que
    # essa lixeira vire região-dica e destrave os filtros de tamanho lá na frente.
    h, w = img_bgr.shape[:2]
    max_frac = 0.85

    polys = []
    for x0, x1, y0, y1 in horizontal[0]:
        r = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], np.float32)
        polys.append((r / upscale).astype(np.int32))
    for quad in free[0]:
        polys.append((np.array(quad, np.float32) / upscale).astype(np.int32))

    sane_polys = []
    for p in polys:
        xs, ys = p[:, 0], p[:, 1]
        if (xs.max() - xs.min()) > max_frac * w or (ys.max() - ys.min()) > max_frac * h:
            continue
        sane_polys.append(p)
    return sane_polys


# --------------------------------------------------------------------------- #
# Máscara
# --------------------------------------------------------------------------- #
def build_mask(img_bgr, polys, dilate=3, refine=True,
               max_glyph_frac=0.12, min_area=25, keep=None,
               min_refine_coverage=0.15, max_stroke=4, max_solid_frac=0.3,
               k_colors=6):
    """Máscara binária (255 = apagar).

    A caixa que o detector devolve para texto em ARCO é enorme (engloba anéis e
    o miolo do escudo). Por isso ela é usada apenas como "região-dica": dentro
    dela, fico só com os componentes conexos pequenos e isolados — as letras.
    Anéis e estrela viram componentes gigantes e são descartados pelo filtro
    de tamanho.

    O fallback pra "caixa inteira" (ver `_glyph_components`) é decidido POR
    POLÍGONO, não numa cobertura agregada de todos juntos. Escudo com nome em
    duas linhas de peso bem diferente (ex: West Bromwich Albion: "WEST
    BROMWICH" fino embaixo de "ALBION" bem mais grosso) tem uma região onde o
    refino funciona bem e outra onde ele corretamente rejeita quase tudo (a
    região do "ALBION" é grossa demais, cai fora do critério de espessura).
    Numa cobertura agregada, a região ruim puxa a média toda pra baixo do
    limiar e um "caixa inteira" apaga também a região que estava sendo bem
    resolvida junto -- foi exatamente isso que aconteceu testando essa
    mudança antes de separar por região.
    """
    h, w = img_bgr.shape[:2]

    def clip_keep(m):
        for (x0, y0, x1, y1) in keep or []:
            m[y0:y1, x0:x1] = 0
        return m

    if not refine:
        mask = np.zeros((h, w), np.uint8)
        for p in polys:
            cv2.fillPoly(mask, [p], 255)
        mask = clip_keep(mask)
    else:
        labels = _kmeans_labels(img_bgr, k_colors)
        max_height = max_glyph_frac * max(w, h)
        mask = np.zeros((h, w), np.uint8)
        for p in polys:
            # A caixa do arco inferior costuma atravessar o escudo inteiro e
            # engolir o monograma central. Não há como a máquina saber que o
            # monograma é a marca e não texto a remover -- isso é decisão do
            # usuário.
            region_hint = np.zeros((h, w), np.uint8)
            cv2.fillPoly(region_hint, [p], 255)
            region_hint = clip_keep(region_hint)
            if region_hint.sum() == 0:
                continue

            region_mask = _glyph_components(img_bgr, region_hint, labels, k_colors,
                                            max_glyph_frac, min_area, max_stroke,
                                            max_solid_frac)
            # Fontes grandes numa caixa PEQUENA (ex: "FCA", "DBU" -- uma
            # linha só, altura da própria letra) às vezes têm letra mais alta
            # que o limite tolerado -- sobra só uma franja de fragmentos de
            # anti-aliasing, pior que não ter refinado nada. Aí sim cai pra
            # caixa inteira, que ao menos remove o texto de forma limpa.
            #
            # Mas isso só vale pra caixa PEQUENA. Numa caixa já grande (bbox
            # de arco inflado pela curvatura, ou uma região que por acidente
            # de detecção engoliu o monograma/emblema junto com o texto), uma
            # cobertura baixa é o SINAL DE QUE O REFINO FUNCIONOU -- a região
            # contém bastante coisa que não é letra por natureza (o
            # monograma do QPR, o navio do Manchester), e pintar a caixa
            # inteira aí destrói exatamente o que a etapa de refino
            # conseguiu preservar corretamente. `bh` do próprio polígono
            # (calculado igual ao filtro de altura usado componente a
            # componente) decide qual dos dois casos é esse.
            ys = p[:, 1]
            region_bh = ys.max() - ys.min()
            fits_fallback = region_bh <= max_height
            if fits_fallback and region_mask.sum() < min_refine_coverage * region_hint.sum():
                print("[i] refino não achou glifos o bastante numa região "
                      "pequena, usando a caixa inteira dela.", file=sys.stderr)
                region_mask = region_hint
            mask = cv2.bitwise_or(mask, region_mask)

    if dilate > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate + 1,) * 2)
        mask = cv2.dilate(mask, k)
    return mask


def _kmeans_labels(img_bgr, k_colors):
    h, w = img_bgr.shape[:2]
    Z = img_bgr.reshape(-1, 3).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, _ = cv2.kmeans(Z, k_colors, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    return labels.reshape(h, w)


def _glyph_components(img_bgr, hint, labels, k_colors, max_glyph_frac, min_area,
                      max_stroke, max_solid_frac):
    """Componentes conexos pequenos e FINOS dentro da região-dica = letras.

    Dois critérios, não um só:

    1. COR (k-means na imagem inteira, como antes) pra achar os blobs --
       preserva o preenchimento inteiro da letra mesmo em fonte grossa
       (ex: "MANCHESTER"), o que uma máscara puramente por espessura perde
       (erosão/abertura só engole traço mais fino que o elemento estruturante;
       testado à parte, "MANCHESTER" tem preenchimento mais largo que
       "UNITED" no mesmo escudo e ficava só com a casca das letras).

    2. ESPESSURA (razão de área que sobrevive à erosão) pra decidir se cada
       blob de cor é letra ou não -- é o que faltava antes: sem isso, o navio
       do escudo do Manchester (amarelo sobre vermelho, mesma cor do texto)
       cai no mesmo cluster de cor da letra e some junto. Um blob comprido e
       fino (letra) perde a maior parte da área na erosão; um blob compacto
       (navio, anel, estrela) perde pouco, porque não estreita em nenhuma
       direção. `max_solid_frac` é o quanto pode sobrar pra ainda contar
       como letra.

    Filtra por ALTURA, não pelo maior lado: um bloco de letras grossas
    coladas (ex: "FCA") é largo mas baixo -- descartá-lo pela largura o
    eliminaria por inteiro.

    O limite de altura é uma fração fixa da imagem inteira, NÃO relativo à
    altura da região-dica de cada polígono (já tentado e revertido): pra
    texto em ARCO, a caixa delimitadora do polígono é inflada pela curvatura
    em si (o "M" no canto esquerdo do arco e o "R" no direito ficam bem mais
    alto/baixo um do outro que a altura real da letra), não pelo tamanho da
    fonte -- confiar nessa altura abriria a porta pra componentes grandes
    vizinhos passarem como se fossem glifo. Fontes retas genuinamente
    grandes (ex: "FCA") que excedem esse limite fixo caem pro fallback de
    "caixa inteira" em build_mask() -- ok pra texto reto, já que a caixa não
    fica desproporcional como fica pra texto em arco.
    """
    h, w = img_bgr.shape[:2]
    max_height = max_glyph_frac * max(w, h)

    erosion_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * max_stroke + 1,) * 2)

    out = np.zeros((h, w), np.uint8)
    for kk in range(k_colors):
        color_mask = ((labels == kk) & (hint > 0)).astype(np.uint8)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(color_mask, 8)
        for i in range(1, n):
            x, y, bw, bh, area = stats[i]
            if area < min_area:            continue   # respingo de antialias
            if bh > max_height:            continue   # anel, estrela, moldura
            comp = (lab == i).astype(np.uint8)
            solid_frac = cv2.erode(comp, erosion_k).sum() / area
            if solid_frac > max_solid_frac:  continue  # sobra grosso demais -- não é traço
            out[lab == i] = 255

    out = _absorb_antialias(img_bgr, out)
    return out


def _absorb_antialias(img_bgr, seed, grow=3, tol=28):
    """Engole o halo de anti-aliasing ao redor de cada glifo.

    Filtrar por área mínima deixa para trás os pixels intermediários da borda
    da letra (área 12-20), que reaparecem como fantasma cinza. Aqui, na coroa
    ao redor do glifo, descubro a cor de fundo local (mediana) e marco tudo que
    destoa dela.
    """
    if seed.sum() == 0:
        return seed
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1,) * 2)
    ring = cv2.dilate(seed, k) & ~seed
    if ring.sum() == 0:
        return seed
    bg = np.median(img_bgr[ring > 0], axis=0)
    zone = cv2.dilate(seed, k)
    far = np.abs(img_bgr.astype(int) - bg[None, None, :]).max(axis=2) > tol
    merged = (seed > 0) | ((zone > 0) & far)
    return merged.astype(np.uint8) * 255


# --------------------------------------------------------------------------- #
# Inpainting
# --------------------------------------------------------------------------- #
def inpaint_lama(img_bgr, mask):
    import torch
    from simple_lama_inpainting import SimpleLama
    from PIL import Image

    if torch.cuda.is_available():
        lama = SimpleLama()
    else:
        # simple-lama-inpainting chama torch.jit.load(model_path) sem
        # map_location, e o checkpoint (big-lama.pt) foi salvo com tensores
        # em CUDA. Numa wheel CPU-only isso quebra no PRÓPRIO carregamento
        # (antes até do model.to(device) rodar) com "could not run
        # aten::empty_strided... CUDA backend" -- sem esse patch o engine
        # "lama"/"auto" nunca funciona nesse tipo de máquina e cai pro cv
        # silenciosamente (inpaint() abaixo engole a exceção no modo auto).
        _orig_load = torch.jit.load
        torch.jit.load = lambda f, *a, **kw: _orig_load(f, map_location=torch.device("cpu"))
        try:
            lama = SimpleLama()
        finally:
            torch.jit.load = _orig_load

    rgb = Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    out = lama(rgb, Image.fromarray(mask))
    return cv2.cvtColor(np.array(out.convert("RGB")), cv2.COLOR_RGB2BGR)


def inpaint_cv(img_bgr, mask, radius=4):
    a = cv2.inpaint(img_bgr, mask, radius, cv2.INPAINT_TELEA)
    b = cv2.inpaint(img_bgr, mask, radius, cv2.INPAINT_NS)
    return cv2.addWeighted(a, 0.5, b, 0.5, 0)


def inpaint(img_bgr, mask, engine="auto", radius=4):
    if engine in ("auto", "lama"):
        try:
            return inpaint_lama(img_bgr, mask)
        except Exception as e:
            if engine == "lama":
                raise
            print(f"[i] LaMa indisponível ({e.__class__.__name__}), "
                  f"usando OpenCV.", file=sys.stderr)
    return inpaint_cv(img_bgr, mask, radius)


# --------------------------------------------------------------------------- #
# Pipeline
# --------------------------------------------------------------------------- #
def process(path_in, path_out, args):
    raw = cv2.imread(str(path_in), cv2.IMREAD_UNCHANGED)
    if raw is None:
        raise ValueError(f"não consegui abrir {path_in}")

    # separa alpha: escudo quase sempre é PNG com transparência
    alpha = None
    if raw.ndim == 3 and raw.shape[2] == 4:
        alpha = raw[:, :, 3]
        img = raw[:, :, :3]
        # fundo transparente vira branco só para a detecção não se confundir
        img = np.where(alpha[..., None] == 0, 255, img).astype(np.uint8)
    elif raw.ndim == 2:
        img = cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)
    else:
        img = raw

    polys = detect_text_polygons(img, langs=tuple(args.langs), gpu=args.gpu,
                                 upscale=args.upscale,
                                 text_threshold=args.text_threshold,
                                 low_text=args.low_text)
    if not polys:
        print(f"[!] nenhum texto detectado em {path_in.name}", file=sys.stderr)
        cv2.imwrite(str(path_out), raw)
        return 0

    mask = build_mask(img, polys, dilate=args.dilate, refine=not args.no_refine,
                      max_stroke=args.max_stroke, max_solid_frac=args.max_solid_frac,
                      k_colors=args.colors, keep=args.keep)
    if alpha is not None:
        mask = cv2.bitwise_and(mask, mask, mask=(alpha > 0).astype(np.uint8) * 255)

    out = inpaint(img, mask, engine=args.engine, radius=args.radius)

    # só troca os pixels mascarados, o resto fica bit a bit idêntico
    m3 = (mask > 0)[..., None]
    out = np.where(m3, out, img).astype(np.uint8)

    if alpha is not None:
        out = np.dstack([out, alpha])

    cv2.imwrite(str(path_out), out)
    print(f"[ok] {path_in.name} -> {path_out}  ({len(polys)} região(ões))", file=sys.stderr)

    if args.debug:
        dbg = img.copy()
        cv2.polylines(dbg, polys, True, (0, 0, 255), 2)
        stem = path_out.with_suffix("")
        cv2.imwrite(f"{stem}_boxes.png", dbg)
        cv2.imwrite(f"{stem}_mask.png", mask)

    return len(polys)


def main():
    ap = argparse.ArgumentParser(description="Remove texto de escudos de times.")
    ap.add_argument("input", type=Path, help="imagem ou pasta")
    ap.add_argument("-o", "--output", type=Path, required=True)
    ap.add_argument("--engine", choices=["auto", "lama", "cv"], default="auto")
    ap.add_argument("--dilate", type=int, default=3,
                    help="pixels de folga ao redor da letra (default 3)")
    ap.add_argument("--radius", type=int, default=4, help="raio do inpaint OpenCV")
    ap.add_argument("--upscale", type=int, default=2,
                    help="fator de ampliação antes de detectar")
    ap.add_argument("--text-threshold", type=float, default=0.6,
                    help="menor = detecta mais texto (e mais falso positivo)")
    ap.add_argument("--low-text", type=float, default=0.3)
    ap.add_argument("--langs", nargs="+", default=["en"],
                    help="idiomas do modelo de RECONHECIMENTO (não afeta a "
                         "detecção, que é o único resultado usado por este "
                         "script -- só importa se for chamar readtext() "
                         "manualmente pra depurar)")
    ap.add_argument("--keep", action="append", type=lambda v: tuple(map(int, v.split(","))),
                    metavar="X0,Y0,X1,Y1",
                    help="região a PRESERVAR (ex: monograma central). Repetível.")
    ap.add_argument("--max-stroke", type=int, default=4,
                    help="raio de erosão pra medir espessura, em px (default 4)")
    ap.add_argument("--max-solid-frac", type=float, default=0.3,
                    help="fração da área que pode sobreviver à erosão e ainda "
                         "contar como letra -- maior deixa passar blob mais "
                         "grosso (default 0.3)")
    ap.add_argument("--colors", type=int, default=6,
                    help="nº de cores da paleta do escudo (k-means)")
    ap.add_argument("--no-refine", action="store_true",
                    help="apaga a caixa inteira em vez de só os glifos")
    ap.add_argument("--gpu", action="store_true")
    ap.add_argument("--debug", action="store_true",
                    help="salva _boxes.png e _mask.png")
    args = ap.parse_args()

    if args.input.is_dir():
        args.output.mkdir(parents=True, exist_ok=True)
        files = [p for p in sorted(args.input.iterdir())
                 if p.suffix.lower() in IMG_EXT]
        for f in files:
            try:
                process(f, args.output / f"{f.stem}_clean.png", args)
            except Exception as e:
                print(f"[erro] {f.name}: {e}", file=sys.stderr)
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        regions_found = process(args.input, args.output, args)
        # Linha final em stdout consumida por scripts/game-badges.mjs (todo o
        # resto acima vai pro stderr) -- mesmo contrato que o antigo
        # paddle_detect_blur.py tinha.
        print(json.dumps({"regionsFound": regions_found}))


if __name__ == "__main__":
    main()
