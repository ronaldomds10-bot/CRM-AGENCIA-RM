import { NextRequest, NextResponse } from "next/server";
import { adminCredentialsMatch, authConfigured, createSession, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { allowRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Autenticação não configurada." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as { email?: string; password?: string };
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const ip = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  if (!allowRequest(`login:${ip}:${email}`, 10, 15 * 60_000)) return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
  if (!email || !password || email.length > 254 || password.length > 1024) {
    return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
  }
  try {
    const admin = adminCredentialsMatch(email, password);
    const result = await getPool().query("SELECT id, role, active, password_hash FROM crm_users WHERE LOWER(email) = $1", [email]);
    const user = result.rows[0] as { id: string; role: string; active: boolean; password_hash: string | null } | undefined;
    if (!user?.active || (!(admin && user.id === "admin") && !verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
    }
    const token = await createSession(user.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Autenticação indisponível." }, { status: 503 });
  }
}
