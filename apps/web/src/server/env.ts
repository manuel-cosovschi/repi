export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} no está configurada (ver .env.example)`);
  return v;
}
export const socialAvailable = {
  google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  apple: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
};
