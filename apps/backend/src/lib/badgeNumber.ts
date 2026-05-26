const BADGE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateBadgeNumberCandidate(): string {
  let value = "";
  for (let index = 0; index < 5; index += 1) {
    const offset = Math.floor(Math.random() * BADGE_ALPHABET.length);
    value += BADGE_ALPHABET[offset];
  }
  return value;
}
