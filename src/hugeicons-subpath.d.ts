// @hugeicons/core-free-icons only ships type declarations in one big
// dist/types/index.d.ts, but we import icons from their individual subpaths
// (e.g. '@hugeicons/core-free-icons/Home01Icon') to avoid esbuild parsing the
// ~5500-file barrel on every build — that was ballooning build memory to the
// point of OOM-killing Vercel's build container.
declare module '@hugeicons/core-free-icons/*' {
  type IconSvgObject =
    | [string, { [key: string]: string | number }][]
    | readonly (readonly [string, { readonly [key: string]: string | number }])[];
  const icon: IconSvgObject;
  export default icon;
}
