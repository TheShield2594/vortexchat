/**
 * Fetch the actor's highest role position in the server.
 * Returns -1 when the actor has no roles (so any positive-positioned role is out of reach).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getActorMaxRolePosition(supabase: any, serverId: string, actorId: string): Promise<number> {
  const { data } = await supabase
    .from("member_roles")
    .select("roles(position)")
    .eq("server_id", serverId)
    .eq("user_id", actorId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Math.max(-1, ...(data ?? []).map((mr: any) => mr.roles?.position ?? -1))
}
