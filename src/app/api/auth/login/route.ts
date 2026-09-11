import { NextResponse } from "next/server";
import { authConfigured, credentialsMatch, SESSION_COOKIE, sessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Autenticação não configurada." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as { email?: string; password?: string };
  if (!body.email || !body.password || !credentialsMatch(body.email, body.password)) {
    return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
