import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"
import { decodeHTML } from "entities"
import GithubSlugger from "github-slugger"
import { marked, Parser, TextRenderer } from "marked"
import { parse as parseYaml } from "yaml"

export interface Resource {
  id: string
  section: string
  title: string
  url: string
  description: string
}
const hosts = new Set(["www.inkwell.software", "app.inkwell.software"])
export function tagged(value: string, placement: string): string {
  const url = new URL(value)
  if (url.protocol !== "https:" || !hosts.has(url.host) || url.username || url.password)
    throw new Error(
      "The generated catalog accepts only first-party Inkwell HTTPS destinations (www.inkwell.software or app.inkwell.software); put external references in the README Open tools and research section",
    )
  if (!/^[a-z0-9_]+$/.test(placement)) throw new Error("Expected snake_case placement")
  for (const key of [...url.searchParams.keys()])
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key)
  for (const [key, item] of Object.entries({
    utm_source: "github",
    utm_medium: "referral",
    utm_campaign: "writing_handbook",
    utm_id: "github_writing_handbook",
    utm_source_platform: "github",
    utm_content: placement,
  }))
    url.searchParams.set(key, item)
  return url.href
}
export function parseResources(value: unknown): Resource[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Catalog must be a nonempty array")
  const seen = new Set<string>()
  return value.map((item: unknown, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error(`Resource ${index + 1}: expected object`)
    const row = item as Record<string, unknown>
    for (const key of ["id", "section", "title", "url", "description"]) {
      if (typeof row[key] !== "string" || !row[key].trim())
        throw new Error(`Resource ${index + 1}: missing or invalid ${key}`)
    }
    const resource = row as unknown as Resource
    if (!/^[a-z0-9_]+$/.test(resource.id) || seen.has(resource.id))
      throw new Error(`Resource ${index + 1}: invalid or duplicate id ${resource.id}`)
    seen.add(resource.id)
    for (const field of [resource.title, resource.section, resource.description])
      if (/[\n\r|<>\[\]`"]/.test(field))
        throw new Error(`Resource ${resource.id}: unsafe Markdown text`)
    const url = new URL(resource.url)
    tagged(resource.url, resource.id)
    if (url.search || url.hash)
      throw new Error(`Resource ${resource.id}: expected clean canonical URL`)
    return resource
  })
}
export function replaceBlock(text: string, name: string, body: string): string {
  const start = `<!-- ${name}:start -->`,
    end = `<!-- ${name}:end -->`
  if (
    text.split(start).length !== 2 ||
    text.split(end).length !== 2 ||
    text.indexOf(start) > text.indexOf(end)
  )
    throw new Error(`Expected one ordered ${name} marker pair`)
  return (
    text.slice(0, text.indexOf(start) + start.length) +
    "\n\n" +
    body +
    "\n\n" +
    text.slice(text.indexOf(end))
  )
}
export interface SectionGroup {
  name: string
  ids: string[]
}
/**
 * How one directory section reads. `table` lists each resource with what it is
 * for. With `groups`, a long section becomes one row per job or form, its
 * resources on one line, so twenty tools scan as five rows; `groupLabel` and
 * `itemLabel` head the two columns. `links` is one line of names, for sections
 * whose titles say everything (terms, languages, apps to switch from). Where a
 * description is not shown, it is the link's hover title.
 */
export interface Section {
  name: string
  intro: string
  layout: "table" | "links"
  groupLabel?: string
  itemLabel?: string
  groups?: SectionGroup[]
}
function safeText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}: missing text`)
  if (/[\n\r|<>\[\]`*_]/.test(value)) throw new Error(`${label}: unsafe Markdown text`)
  return value
}
/**
 * Sections in reading order. Every resource's section is listed once, every
 * listed section has resources, and a grouped section places each of its
 * resources in exactly one group, so nothing can drop out of the directory.
 */
export function parseSections(value: unknown, resources: Resource[]): Section[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Sections must be a nonempty array")
  const names = new Set<string>()
  const sections = value.map((item: unknown, index): Section => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error(`Section ${index + 1}: expected object`)
    const row = item as Record<string, unknown>
    const name = safeText(row.name, `Section ${index + 1} name`)
    if (names.has(name)) throw new Error(`Section ${name}: listed twice`)
    names.add(name)
    const intro = safeText(row.intro, `Section ${name} intro`)
    if (row.layout !== "table" && row.layout !== "links")
      throw new Error(`Section ${name}: layout must be table or links`)
    const members = resources.filter((resource) => resource.section === name).map((r) => r.id)
    if (!members.length) throw new Error(`Section ${name}: no resources`)
    if (row.groups === undefined) return { name, intro, layout: row.layout }
    if (row.layout !== "table") throw new Error(`Section ${name}: only a table can be grouped`)
    const groupLabel = safeText(row.groupLabel, `Section ${name} groupLabel`)
    const itemLabel = safeText(row.itemLabel, `Section ${name} itemLabel`)
    if (!Array.isArray(row.groups) || !row.groups.length)
      throw new Error(`Section ${name}: groups must be a nonempty array`)
    const placed = new Set<string>()
    const groups = row.groups.map((group: unknown, position): SectionGroup => {
      if (!group || typeof group !== "object" || Array.isArray(group))
        throw new Error(`Section ${name} group ${position + 1}: expected object`)
      const entry = group as Record<string, unknown>
      const groupName = safeText(entry.name, `Section ${name} group ${position + 1}`)
      if (!Array.isArray(entry.ids) || !entry.ids.length)
        throw new Error(`Section ${name} group ${groupName}: ids must be a nonempty array`)
      const ids = entry.ids.map((id: unknown) => {
        if (typeof id !== "string" || !members.includes(id))
          throw new Error(
            `Section ${name} group ${groupName}: ${String(id)} is not in this section`,
          )
        if (placed.has(id)) throw new Error(`Section ${name}: ${id} is in two groups`)
        placed.add(id)
        return id
      })
      return { name: groupName, ids }
    })
    const missing = members.filter((id) => !placed.has(id))
    if (missing.length) throw new Error(`Section ${name}: ungrouped ${missing.join(", ")}`)
    return { name, intro, layout: row.layout, groupLabel, itemLabel, groups }
  })
  const unlisted = [...new Set(resources.map((r) => r.section))].filter((s) => !names.has(s))
  if (unlisted.length)
    throw new Error(`Sections missing from sections.json: ${unlisted.join(", ")}`)
  return sections
}
export function directory(resources: Resource[], sections: Section[]): string {
  const byId = new Map(resources.map((row) => [row.id, row]))
  const link = (row: Resource) => `[${row.title}](${tagged(row.url, `directory_${row.id}`)})`
  // The description becomes the hover title where the layout does not show it.
  const titled = (row: Resource) =>
    `[${row.title}](${tagged(row.url, `directory_${row.id}`)} "${row.description}")`
  const slugger = new GithubSlugger()
  const jump = sections.map((section) => `[${section.name}](#${slugger.slug(section.name)})`)
  const body = sections.map((section) => {
    const rows = resources.filter((row) => row.section === section.name)
    let content: string
    if (section.layout === "links") content = rows.map(titled).join(" · ")
    else if (section.groups) {
      const lines = section.groups.map((group) => {
        const links = group.ids.map((id) => {
          const row = byId.get(id)
          if (!row) throw new Error(`Unknown resource ${id}`)
          return titled(row)
        })
        return `| **${group.name}** | ${links.join(" · ")} |`
      })
      content = `| ${section.groupLabel} | ${section.itemLabel} |\n|---|---|\n${lines.join("\n")}`
    } else
      content = `| Resource | Use it for |\n|---|---|\n${rows.map((row) => `| ${link(row)} | ${row.description} |`).join("\n")}`
    return `### ${section.name}\n\n${section.intro}\n\n${content}`
  })
  return [`**Jump to:** ${jump.join(" · ")}`, ...body].join("\n\n")
}
const placements: Record<string, readonly string[]> = {
  "plan-a-draft": ["plot", "canvas"],
  "review-a-revision": ["screenplay_diff", "help"],
  "review-ai-edits": ["help", "scene_order"],
  "prepare-a-handoff": ["fdx_inspector", "interop"],
}
export function generate(root: string, write = false): void {
  const resources = parseResources(
    JSON.parse(readFileSync(resolve(root, "resources.json"), "utf8")),
  )
  const sections = parseSections(
    JSON.parse(readFileSync(resolve(root, "sections.json"), "utf8")),
    resources,
  )
  const outputs = new Map<string, string>()
  const readme = resolve(root, "README.md")
  outputs.set(
    readme,
    replaceBlock(readFileSync(readme, "utf8"), "resources", directory(resources, sections)),
  )
  for (const [workflow, ids] of Object.entries(placements)) {
    const links = ids.map((id) => {
      const row = resources.find((row) => row.id === id)
      if (!row) throw new Error(`Workflow ${workflow}: unknown resource ${id}`)
      return `- [${row.title}](${tagged(row.url, `workflow_${workflow.replaceAll("-", "_")}_${id}`)}) — ${row.description}.`
    })
    const path = resolve(root, "workflows", `${workflow}.md`)
    outputs.set(path, replaceBlock(readFileSync(path, "utf8"), "next-steps", links.join("\n")))
  }
  // Validate all marker pairs and resources before writing any generated file.
  for (const [path, output] of outputs) {
    if (write) writeFileSync(path, output)
    else if (readFileSync(path, "utf8") !== output)
      throw new Error(`Stale generated content: ${relative(root, path)}; run pnpm generate`)
  }
}
function navigationFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules"].includes(entry.name)) return []
    const path = resolve(root, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${path}`)
    return entry.isDirectory()
      ? navigationFiles(path)
      : /\.(md|ya?ml|cff)$/.test(entry.name) || entry.name === "llms.txt"
        ? [path]
        : []
  })
}
function repository(root: string): string {
  const metadata: unknown = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
  const repo =
    metadata && typeof metadata === "object" ? Reflect.get(metadata, "repository") : undefined
  const value: unknown = repo && typeof repo === "object" ? Reflect.get(repo, "url") : undefined
  if (typeof value !== "string" || !/^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?$/.test(value))
    throw new Error("package.json must name the canonical GitHub repository URL")
  return value.replace(/\.git$/, "")
}
function sourceLinks(path: string): string[] {
  const text = readFileSync(path, "utf8")
  if (path.endsWith(".md") || path.endsWith("llms.txt")) return navigation(text).links
  const links: string[] = []
  function visit(value: unknown): void {
    if (typeof value === "string" && /^https?:\/\//.test(value)) links.push(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === "object") Object.values(value).forEach(visit)
  }
  visit(parseYaml(text))
  return links
}
/** Same-repository blob links are checked against the candidate before publication. */
export function externalUrls(root: string, published = false): string[] {
  const prefix = `${repository(root)}/blob/main/`
  return [
    ...new Set(
      navigationFiles(root)
        .flatMap(sourceLinks)
        .filter((href) => /^https?:\/\//.test(href) && (published || !href.startsWith(prefix))),
    ),
  ]
}
export function navigation(text: string): { links: string[]; anchors: Set<string> } {
  const links: string[] = [],
    anchors = new Set<string>(),
    slugger = new GithubSlugger()
  const tokens = marked.lexer(text)
  const parser = new Parser()
  const textRenderer = new TextRenderer()
  textRenderer.parser = parser
  marked.walkTokens(tokens, (token) => {
    if (token.type === "link" || token.type === "image") links.push(token.href)
    if (token.type === "heading")
      anchors.add(
        slugger.slug(
          decodeHTML(
            parser.parseInline(token.tokens ?? marked.Lexer.lexInline(token.text), textRenderer),
          ),
        ),
      )
    // Handbook uses Markdown navigation. HTML comments are generation markers.
    if (token.type === "html" && !/^\s*<!--[\s\S]*-->\s*$/.test(token.raw))
      throw new Error("Use Markdown instead of raw HTML for handbook content")
  })
  return { links, anchors }
}
export function checkLocal(root: string): void {
  const base = realpathSync(root)
  const prefix = `${repository(root)}/blob/main/`
  for (const path of navigationFiles(root)) {
    for (const original of sourceLinks(path)) {
      const ownBlob = original.startsWith(prefix)
      const href = ownBlob ? original.slice(prefix.length) : original
      if (!ownBlob && /^(https?:|mailto:)/.test(href)) continue
      if (/^[a-z][\w+.-]*:/i.test(href) || href.startsWith("//"))
        throw new Error(`Unsupported navigation: ${href}`)
      const url = new URL(href, "https://local.invalid/")
      const filePart = href.split("#")[0]?.split("?")[0] ?? ""
      const target = filePart
        ? resolve(ownBlob ? root : dirname(path), decodeURIComponent(filePart))
        : path
      if (!existsSync(target))
        throw new Error(`${relative(root, path)}: missing destination ${href}`)
      const rel = relative(base, realpathSync(target))
      if (rel === ".." || rel.startsWith(`..${sep}`))
        throw new Error(`Destination escapes handbook: ${href}`)
      if (url.hash) {
        if (!target.endsWith(".md"))
          throw new Error(`Anchor requires a Markdown destination: ${href}`)
        if (
          !navigation(readFileSync(target, "utf8")).anchors.has(
            decodeURIComponent(url.hash.slice(1)),
          )
        )
          throw new Error(`${relative(root, path)}: missing anchor ${href}`)
      }
    }
  }
}
export async function checkUrl(
  value: string,
  request: typeof fetch = fetch,
): Promise<{ url: string; status: number; finalUrl: string }> {
  const response = await request(value, {
    signal: AbortSignal.timeout(30000),
    headers: { "user-agent": "Inkwell-Writing-Handbook-LinkCheck/1.0" },
  })
  await response.body?.cancel()
  if (!response.ok) throw new Error(`${value}: HTTP ${response.status}`)
  const source = new URL(value),
    final = new URL(response.url || value)
  if (hosts.has(source.host) && (final.protocol !== "https:" || !hosts.has(final.host)))
    throw new Error(`${value}: redirect left the first-party Inkwell destinations`)
  for (const [key, item] of source.searchParams)
    if (key.startsWith("utm_") && final.searchParams.get(key) !== item)
      throw new Error(`${value}: redirect lost ${key}`)
  return { url: value, status: response.status, finalUrl: final.href }
}
