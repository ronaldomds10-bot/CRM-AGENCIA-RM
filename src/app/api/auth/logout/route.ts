import { NextRequest, NextResponse } from "next/server";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  await revokeSession(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
