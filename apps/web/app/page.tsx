import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, CheckCircle2, Sparkles, Users, Video } from "lucide-react"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const featureCards = [
  {
    title: "Workspaces that stay organized",
    description: "Create servers with channels for projects, teams, and communities so conversations remain easy to follow.",
    icon: Users,
  },
  {
    title: "Realtime chat + voice",
    description: "Move from text to voice instantly with low-latency communication and a familiar, community-first layout.",
    icon: Video,
  },
  {
    title: "Modern moderation tools",
    description: "Keep spaces healthy with permissions, moderation timelines, and controls built for growing communities.",
    icon: CheckCircle2,
  },
]

export default async function HomePage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (!error && user) {
    redirect("/channels/me")
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-20 md:px-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/50 bg-indigo-500/10 px-4 py-1 text-sm text-indigo-200">
              <Sparkles className="h-4 w-4" /> Built for teams and communities
            </p>
            <h1 className="text-4xl font-extrabold leading-tight md:text-6xl">Bring your people together on VortexChat.</h1>
            <p className="mt-5 text-lg text-slate-300 md:text-xl">
              VortexChat is a modern communication platform for real-time messaging, voice, and community collaboration.
              Start conversations, launch channels, and keep everyone connected in one place.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 font-semibold text-white transition hover:bg-indigo-400"
              >
                Create account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-white/20 bg-white/5 px-5 py-3 font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          </div>

          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/70 p-6 backdrop-blur">
            <p className="text-sm font-medium text-indigo-300">Why teams choose VortexChat</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-200">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                Purpose-built channels for focused conversations
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                Voice and chat designed for always-on collaboration
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                Permissions and safety tools that scale with your group
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-14 md:grid-cols-3 md:px-10">
        {featureCards.map(({ title, description, icon: Icon }) => (
          <article key={title} className="rounded-xl border border-white/10 bg-slate-900/50 p-6">
            <Icon className="h-5 w-5 text-indigo-300" />
            <h2 className="mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-slate-300">{description}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
