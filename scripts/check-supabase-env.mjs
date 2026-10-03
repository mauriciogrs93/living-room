const names = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

for (const name of names) {
  const value = process.env[name];
  console.log(`${name}: ${value && value.trim() ? "set" : "missing"}`);
}
