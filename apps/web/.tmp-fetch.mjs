import { request } from "@playwright/test";
const [state, ...paths] = process.argv.slice(2);
const r = await request.newContext({ baseURL: "https://repiclub.com", storageState: state });
for (const p of paths) { const x = await r.get(p); console.log(p, x.status(), (await x.text()).slice(0, 2500)); }
await r.dispose();
