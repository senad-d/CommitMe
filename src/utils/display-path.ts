function escapedControlCharacter(character: string, codePoint: number): string {
  if (character === "\r") return String.raw`\r`;
  if (character === "\n") return String.raw`\n`;
  if (character === "\t") return String.raw`\t`;
  return String.raw`\x${codePoint.toString(16).padStart(2, "0")}`;
}

export function formatDisplayPath(path: string): string {
  let output = "";
  for (const character of path) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    output += codePoint <= 0x1f || codePoint === 0x7f ? escapedControlCharacter(character, codePoint) : character;
  }
  return output;
}
