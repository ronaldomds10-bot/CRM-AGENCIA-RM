import { NextRequest, NextResponse } from "next/server";
import { adminCredentialsMatch, allowLoginAttempt, authConfigured, clearLoginAttempts, createSession, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";

export const runtime = "nodejs";
const DUMMY_PASSWORD_HASH = "00000000000000000000000000000000:a79be277f4164331643603688348e47bf86ce3900a63b8bc1a837c090f25b555cda39a106f0a1b8766ca7678fda8c3615c23c3b3b0c6b71e24b5628cb8f99a07";

export async function POST(request: NextRequest) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  if (!authConfigured()) {
    return NextResponse.json({ error: "Autenticação não configurada." }, { status: 503 });
  }
  try {
    const body = await readJsonBody<{ email?: string; password?: string }>(request, 4 * 1024);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password || email.length > 254 || password.length > 1024) {
      return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
    }
    const ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for")?.split(",")[0] || "local").trim();
    const [accountLimit, ipLimit] = await Promise.all([
      allowLoginAttempt([`account:${email}`], 10, 15 * 60_000),
      allowLoginAttempt([`ip:${ip}`], 60, 15 * 60_000),
    ]);
    if (!accountLimit.allowed || !ipLimit.allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
    const result = await getPool().query(`SELECT u.id,u.email,u.tenant_role AS role,u.active,u.password_hash
      FROM crm_users u LEFT JOIN agencies a ON a.id=u.agency_id
      WHERE (LOWER(u.email)=$1 OR LOWER(u.name)=$1)
        AND (u.tenant_role='super_admin' OR a.active=TRUE)`, [email]);
    const matches = result.rows as Array<{ id: string; email: string; role: string; active: boolean; password_hash: string | null }>;
    const user = matches.find((item) => item.email.toLowerCase() === email) || (matches.length === 1 ? matches[0] : undefined);
    const authenticated = user?.id === "admin" && !user.password_hash
      ? adminCredentialsMatch(email, password)
      : verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user?.active || !authenticated) {
      return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
    }
    await clearLoginAttempts([...accountLimit.hashes, ...ipLimit.hashes]);
    const token = await createSession(user.id);
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Autenticação indisponível." }, { status: 503 });
  }
}
