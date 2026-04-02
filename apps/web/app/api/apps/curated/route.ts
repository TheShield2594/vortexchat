import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

export interface CuratedSection {
  id: string
  slug: string
  title: string
  description: string | null
  apps: {
    id: string
    name: string
    slug: string
    description: string | null
    category: string
    trust_badge: "verified" | "partner" | "internal" | null
    average_rating: number
    review_count: number
    icon_url: string | null
  }[]
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServiceRoleClient()

    const { data: sections, error: sectionsError } = await supabase
      .from("app_curated_sections")
      .select("id, slug, title, description")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })

    if (sectionsError || !sections) {
      return NextResponse.json([])
    }

    const sectionIds = sections.map((s) => s.id)
    if (sectionIds.length === 0) {
      return NextResponse.json([])
    }

    const { data: entries, error: entriesError } = await supabase
      .from("app_curated_entries")
      .select("section_id, sort_order, app_id")
      .in("section_id", sectionIds)
      .order("sort_order", { ascending: true })

    if (entriesError || !entries || entries.length === 0) {
      return NextResponse.json([])
    }

    const appIds = [...new Set(entries.map((e) => e.app_id))]

    const { data: apps, error: appsError } = await supabase
      .from("app_catalog")
      .select("id, slug, name, description, category, trust_badge, average_rating, review_count, icon_url")
      .in("id", appIds)
      .eq("is_published", true)

    if (appsError || !apps) {
      return NextResponse.json([])
    }

    const appMap = new Map(apps.map((a) => [a.id, a]))

    const result: CuratedSection[] = sections
      .map((section) => {
        const sectionEntries = entries
          .filter((e) => e.section_id === section.id)
          .sort((a, b) => a.sort_order - b.sort_order)

        const sectionApps = sectionEntries
          .map((e) => appMap.get(e.app_id))
          .filter((a): a is NonNullable<typeof a> => a != null)

        return {
          id: section.id,
          slug: section.slug,
          title: section.title,
          description: section.description,
          apps: sectionApps,
        }
      })
      .filter((s) => s.apps.length > 0)

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
