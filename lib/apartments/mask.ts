/** "mauricio@example.com" -> "ma•••@example.com" (the page shows who is signed in without the full address). */
export function maskEmail(email: string) {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}•••@${domain}`;
}
