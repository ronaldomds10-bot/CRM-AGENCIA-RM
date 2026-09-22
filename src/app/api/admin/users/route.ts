import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (actor.role !== "admin") return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const result = await getPool().query("SELECT id, email, name, role, active, created_at FROM crm_users ORDER BY created_at, email");
  return NextResponse.json({ users: result.rows }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (actor.role !== "admin") return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { email?: string; name?: string; password?: string; role?: string };
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  const role = body.role || "user";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120 || password.length < 12 || password.length > 1024 || !["admin", "user"].includes(role)) {
    return NextResponse.json({ error: "Informe nome, e-mail e senha de pelo menos 12 caracteres." }, { status: 400 });
  }
  try {
    const result = await getPool().query(
      "INSERT INTO crm_users (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role, active, created_at",
      [randomUUID(), email, name, role, hashPassword(password)],
    );
    return NextResponse.json({ user: result.rows[0] }, { status: 201, headers: noStore });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "E-mail já cadastrado." }, { status: 409 });
    return NextResponse.json({ error: "Não foi possível criar usuário." }, { status: 503 });
  }
}
