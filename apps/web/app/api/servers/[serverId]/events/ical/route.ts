import { createServerSupabaseClient } from "@/lib/supabase/server"
import { buildICal } from "@/lib/events"

export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  try {
    const params = await paramsPromise
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response("Unauthorized", { status: 401 })

    const { data: events, error } = await supabase
      .from("events")
      .select("id,title,description,location,timezone,start_at,end_at,recurrence,recurrence_until,capacity,cancelled_at")
      .eq("server_id", params.serverId)
      .is("cancelled_at", null)
      .order("start_at", { ascending: true })

    if (error) return new Response("Failed to fetch events", { status: 500 })

    const body = buildICal(events ?? [])

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename=server-${params.serverId}-events.ics`,
      },
    })

  } catch (err) {
    console.error("[servers/[serverId]/events/ical GET] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
