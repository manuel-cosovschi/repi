// Versión desplegada (D92): el commit de Vercel; "dev" fuera de Vercel. La página la lleva en <meta name="repi-version">
// y la compara con /api/version para avisar que hay una versión nueva sin recargar en medio de algo pendiente.
export const appVersion = () => process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "dev";
