/** "an" before a vowel sound we actually use (ink, orange). */
export function article(word: string) {
  return /^[aeiou]/i.test(word.trim()) ? "an" : "a";
}
