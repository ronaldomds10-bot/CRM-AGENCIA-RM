import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { canManageTenantUser, isAgencyManager, isSuperAdmin, type UserRole } from "@/lib/tenant";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";

export const runtime = "nodejs";
const roles: UserRole[] = ["super_admin", "agency_admin", "agency_user"];

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAgencyManager(actor)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const { id } = await context.params;
  let body: { email?: string; name?: string; password?: string; role?: UserRole; active?: boolean; agencyId?: string };
  try { body = await readJsonBody(request, 8 * 1024); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestInputError ? error.message : "Dados inválidos." }, { status: error instanceof RequestInputError ? error.status : 400 }); }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id,email,name,tenant_role AS role,active,agency_id AS \"agencyId\" FROM crm_users WHERE id=$1 FOR UPDATE", [id]);
    const user = existing.rows[0] as { id: string; email: string; name: string; role: UserRole; active: boolean; agencyId: string | null } | undefined;
    if (!user) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 }); }
    if (!canManageTenantUser(actor, user)) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Usuário de outra agência." }, { status: 403 }); }
    const email = body.email === undefined ? user.email : String(body.email).trim().toLowerCase();
    const name = body.name === undefined ? user.name : String(body.name).trim();
    const role = body.role === undefined ? user.role : body.role;
    const active = body.active === undefined ? user.active : body.active;
    const password = body.password === undefined ? null : String(body.password);
    const agencyId = isSuperAdmin(actor) && body.agencyId !== undefined ? String(body.agencyId || "") || null : user.agencyId;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120 || !roles.includes(role) || typeof active !== "boolean" || (password !== null && (password.length < 12 || password.length > 1024)) || (role !== "super_admin" && !agencyId)) {
      await client.query("ROLLBACK"); return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }
    if (!isSuperAdmin(actor) && (role === "super_admin" || agencyId !== actor.agencyId)) {
      await client.query("ROLLBACK"); return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }
    if (id === "admin" && (role !== "super_admin" || !active || agencyId !== null)) {
      await client.query("ROLLBACK"); return NextResponse.json({ error: "O superadministrador principal deve permanecer ativo." }, { status: 403 });
    }
    if (id === actor.id && (!active || role !== actor.role || agencyId !== actor.agencyId)) {
      await client.query("ROLLBACK"); return NextResponse.json({ error: "Não altere seu próprio acesso." }, { status: 403 });
    }
    if (agencyId) {
      const agency = await client.query("SELECT id FROM agencies WHERE id=$1 AND active=TRUE", [agencyId]);
      if (!agency.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Agência inválida ou inativa." }, { status: 400 }); }
    }
    const legacyRole = role === "agency_user" ? "user" : "admin";
    const result = await client.query(
      `UPDATE crm_users SET email=$2,name=$3,role=$4,tenant_role=$5,active=$6,agency_id=$7,
       password_hash=COALESCE($8,password_hash),updated_at=NOW() WHERE id=$1
       RETURNING id,email,name,tenant_role AS role,active,created_at,agency_id`,
      [id, email, name, legacyRole, role, active, role === "super_admin" ? null : agencyId, password === null ? null : hashPassword(password)],
    );
    if (password !== null || !active || role !== user.role || agencyId !== user.agencyId) await client.query("DELETE FROM crm_sessions WHERE user_id=$1", [id]);
    await client.query("COMMIT");
    return NextResponse.json({ user: result.rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "E-mail já cadastrado." }, { status: 409 });
    return NextResponse.json({ error: "Não foi possível editar usuário." }, { status: 503 });
  } finally { client.release(); }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAgencyManager(actor)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const { id } = await context.params;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id,tenant_role AS role,agency_id AS \"agencyId\" FROM crm_users WHERE id=$1 FOR UPDATE", [id]);
    const user = existing.rows[0] as { id: string; role: UserRole; agencyId: string | null } | undefined;
    if (!user) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 }); }
    if (id === actor.id || id === "admin" || user.role === "super_admin" || !canManageTenantUser(actor, user)) {
      await client.query("ROLLBACK"); return NextResponse.json({ error: "Este usuário não pode ser excluído." }, { status: 403 });
    }
    if (user.agencyId) {
      const state = await client.query("SELECT payload FROM crm_state WHERE agency_id=$1 FOR UPDATE", [user.agencyId]);
      const payload = state.rows[0]?.payload as Record<string, unknown> | undefined;
      if (payload) {
        for (const key of ["quotes", "clients", "suppliers", "events"]) {
          const records = payload[key];
          if (!Array.isArray(records)) continue;
          payload[key] = records.map((record: Record<string, unknown>) => ({
            ...record,
            ...(record.ownerId === id ? { ownerId: "admin" } : {}),
            ...(record.assignedUserId === id ? { assignedUserId: null } : {}),
          }));
        }
        if (payload.userSettings && typeof payload.userSettings === "object" && !Array.isArray(payload.userSettings)) delete (payload.userSettings as Record<string, unknown>)[id];
        await client.query("UPDATE crm_state SET payload=$2::jsonb,updated_at=NOW() WHERE agency_id=$1", [user.agencyId, JSON.stringify(payload)]);
      }
    }
    await client.query("DELETE FROM crm_users WHERE id=$1", [id]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Falha ao excluir usuário:", error);
    return NextResponse.json({ error: "Não foi possível excluir o usuário." }, { status: 503 });
  } finally { client.release(); }
}
