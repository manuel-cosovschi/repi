// .ics de una sesión agendada (F-HX-07, D98): para el alumno de la relación o el coach dueño. Sin datos de salud.
import { NextResponse } from "next/server";
import { appointmentIcs } from "@repi/domain";
import { sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import { appointmentForCalendar } from "@/server/training/agenda";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await appointmentForCalendar(await sessionUserId(), (await params).id);
    return new NextResponse(appointmentIcs(a), { headers: {
      "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="repi-sesion.ics"`, "cache-control": "private, no-store",
    } });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
}
