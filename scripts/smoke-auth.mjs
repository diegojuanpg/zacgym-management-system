// Chequeo de auth contra el Supabase local. `pnpm smoke:auth` (necesita `pnpm db:start`).
import assert from "node:assert/strict";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.SMOKE_EMAIL ?? "diego@zacgym.com";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "zacgym-2026-test";

if (!KEY) throw new Error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY (cargá .env.local)");

const post = (path, body) =>
  fetch(`${URL_BASE}${path}`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const login = (password) =>
  post(`/auth/v1/token?grant_type=password`, { email: EMAIL, password });

const ok = await login(PASSWORD);
const session = await ok.json();
assert.equal(ok.status, 200, `login valido deberia dar 200, dio ${ok.status}`);
assert.ok(session.access_token, "el login no devolvio access_token");
assert.ok(
  ["admin", "employee"].includes(session.user.app_metadata.role),
  `rol invalido en el JWT: ${session.user.app_metadata.role}`,
);

const bad = await login("password-incorrecta");
assert.equal(bad.status, 400, `password incorrecta deberia dar 400, dio ${bad.status}`);

const signup = await post("/auth/v1/signup", {
  email: `intruso-${Date.now()}@zacgym.com`,
  password: "loquesea1234",
});
assert.equal(signup.status, 422, `el signup publico deberia estar cerrado, dio ${signup.status}`);

const recover = await post("/auth/v1/recover", { email: EMAIL });
assert.equal(recover.status, 200, `recover deberia dar 200, dio ${recover.status}`);

console.log(`auth OK — rol ${session.user.app_metadata.role}, signup cerrado, recovery viva`);
