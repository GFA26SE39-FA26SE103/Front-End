// SVG icons exported from Figma (file 8oVvtkRjHpZOpjnRRXO2hV). Each colour variant is its own file.
const files = import.meta.glob<string>('./icons/*.svg', { eager: true, query: '?url', import: 'default' });

export const icons: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.replace('./icons/', '').replace('.svg', ''), url]),
);

export function icon(name: string): string {
  const url = icons[name];
  if (!url) throw new Error(`Unknown icon: ${name}`);
  return url;
}
