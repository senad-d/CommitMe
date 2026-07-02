function escapedControlCharacter(character: string, codePoint: number): string {
  if (character === "\r") return "\\r";
  if (character === "\n") return "\\n";
  if (character === "\t") return "\\t";
  return `\\x${codePoint.toString(16).padStart(2, "0")}`;
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
