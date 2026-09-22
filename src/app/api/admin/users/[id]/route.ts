import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (actor.role !== "admin") return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { email?: string; name?: string; password?: string; role?: string; active?: boolean };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id, email, name, role, active FROM crm_users WHERE id = $1 FOR UPDATE", [id]);
    const user = existing.rows[0];
    if (!user) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 }); }
    const email = body.email === undefined ? user.email : String(body.email).trim().toLowerCase();
    const name = body.name === undefined ? user.name : String(body.name).trim();
    const role = body.role === undefined ? user.role : body.role;
    const active = body.active === undefined ? user.active : body.active;
    const password = body.password === undefined ? null : String(body.password);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120 || !["admin", "user"].includes(role) || typeof active !== "boolean" || (password !== null && (password.length < 12 || password.length > 1024))) {
      await client.query("ROLLBACK"); return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }
    if (id === "admin" && (email !== (process.env.CRM_ADMIN_EMAIL || "").trim().toLowerCase() || role !== "admin" || !active)) {
      await client.query("ROLLBACK"); return NextResponse.json({ error: "O administrador principal deve permanecer ativo." }, { status: 403 });
    }
    if (id === actor.id && (!active || role !== "admin")) {
      await client.query("ROLLBACK"); return NextResponse.json({ error: "Não altere seu próprio acesso." }, { status: 403 });
    }
    const result = await client.query(
      `UPDATE crm_users SET email = $2, name = $3, role = $4, active = $5,
       password_hash = COALESCE($6, password_hash), updated_at = NOW()
       WHERE id = $1 RETURNING id, email, name, role, active, created_at`,
      [id, email, name, role, active, password === null ? null : hashPassword(password)],
    );
    if (password !== null || !active || role !== user.role) await client.query("DELETE FROM crm_sessions WHERE user_id = $1", [id]);
    await client.query("COMMIT");
    return NextResponse.json({ user: result.rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "E-mail já cadastrado." }, { status: 409 });
    return NextResponse.json({ error: "Não foi possível editar usuário." }, { status: 503 });
  } finally {
    client.release();
  }
}
