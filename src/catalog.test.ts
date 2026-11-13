import assert from "node:assert/strict"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
  checkLocal,
  checkUrl,
  directory,
  externalUrls,
  generate,
  navigation,
  parseResources,
  parseSections,
  replaceBlock,
  tagged,
} from "./catalog.ts"

const row = {
  id: "example",
  section: "Example",
  title: "Example",
  url: "https://www.inkwell.software/",
  description: "Example",
}
test("catalog rejects malformed, empty, duplicate and unsafe content before rendering", () => {
  for (const value of [
    null,
    {},
    [],
    [null],
    [{}],
    [{ ...row, title: 5 }],
    [row, row],
    [{ ...row, id: "bad id" }],
    [{ ...row, title: "bad](url)" }],
    [{ ...row, url: row.url + "?utm_source=old" }],
  ])
    assert.throws(() => parseResources(value))
  assert.equal(parseResources([row])[0]?.id, "example")
  for (const url of ["https://example.com/guide", "https://inkwell.software/guide"])
    assert.throws(() => parseResources([{ ...row, url }]), /first-party/)
})
test("retagging preserves ordinary query and fragment, removes all prior UTM fields", () => {
  const url = new URL(
    tagged(
      "https://www.inkwell.software/tools?q=a%26b&utm_source=old&UTM_custom=old#example",
      "test_link",
    ),
  )
  assert.equal(url.searchParams.get("q"), "a&b")
  assert.equal(url.hash, "#example")
  assert.equal(url.searchParams.get("utm_source"), "github")
  assert.equal(url.searchParams.has("UTM_custom"), false)
  for (const bad of [
    "http://www.inkwell.software/",
    "https://www.inkwell.software.evil.test/",
    "https://user@www.inkwell.software/",
  ])
    assert.throws(() => tagged(bad, "link"))
  assert.throws(() => tagged(row.url, "bad id"))
})
test("generation rejects missing, reversed and repeated markers", () => {
  for (const text of [
    "",
    "<!-- x:end --><!-- x:start -->",
    "<!-- x:start --><!-- x:start --><!-- x:end -->",
  ])
    assert.throws(() => replaceBlock(text, "x", "new"))
  assert.equal(
    replaceBlock("before<!-- x:start -->old<!-- x:end -->after", "x", "new"),
    "before<!-- x:start -->\n\nnew\n\n<!-- x:end -->after",
  )
})
test("Markdown navigation includes images, reference links, autolinks and duplicate headings", () => {
  const result = navigation(
    "# One\n# One\n![image](asset.svg)\n[ref][x]\n\n[x]: other.md\n\n<https://example.com/>",
  )
  assert.deepEqual(result.links, ["asset.svg", "other.md", "https://example.com/"])
  assert.deepEqual([...result.anchors], ["one", "one-1"])
  assert.throws(() => navigation('<a href="lost.md">bad</a>'))
})
test("navigation detects missing image, renamed heading, missing file and escape", () => {
  const root = mkdtempSync(join(tmpdir(), "handbook-nav-"))
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ repository: { url: "https://github.com/example/handbook.git" } }),
    )
    mkdirSync(join(root, "docs"))
    writeFileSync(join(root, "docs/page.md"), "# Valid\n")
    writeFileSync(join(root, "README.md"), "[go](docs/page.md#valid)")
    checkLocal(root)
    for (const link of ["docs/page.md#renamed", "missing.md", "missing.svg", "../"]) {
      writeFileSync(join(root, "README.md"), `![test](${link})`)
      assert.throws(() => checkLocal(root))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
test("live checker fails HTTP errors, transport failure and redirect UTM loss", async () => {
  const url = tagged(row.url, "test_link")
  const fake = (status: number, finalUrl: string) => async () => {
    const response = new Response(null, { status })
    Object.defineProperty(response, "url", { value: finalUrl })
    return response
  }
  assert.equal((await checkUrl(url, fake(200, url))).status, 200)
  await assert.rejects(() => checkUrl(url, fake(404, url)), /HTTP 404/)
  await assert.rejects(() => checkUrl(url, fake(200, row.url)), /redirect lost/)
  await assert.rejects(
    () => checkUrl(url, fake(200, url.replace("www.inkwell.software", "example.com"))),
    /left the first-party/,
  )
  await assert.rejects(
    () =>
      checkUrl(url, async () => {
        throw new Error("offline")
      }),
    /offline/,
  )
})

test("metadata and LLM navigation share local validation and live URL discovery", () => {
  const root = mkdtempSync(join(tmpdir(), "handbook-metadata-"))
  const blob = "https://github.com/example/handbook/blob/main/"
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ repository: { url: "https://github.com/example/handbook.git" } }),
    )
    mkdirSync(join(root, ".github/ISSUE_TEMPLATE"), { recursive: true })
    mkdirSync(join(root, "examples"))
    writeFileSync(join(root, "examples/sample.md"), "# Sample\n")
    writeFileSync(join(root, "llms.txt"), `[Example](${blob}examples/sample.md#sample)`)
    writeFileSync(
      join(root, ".github/ISSUE_TEMPLATE/config.yml"),
      'contact_links:\n  - url: "https://example.com/help?utm_content=issue_help"\n',
    )
    writeFileSync(
      join(root, "CITATION.cff"),
      'repository-code: "https://github.com/example/handbook"\n',
    )
    checkLocal(root)
    assert.deepEqual(
      externalUrls(root).sort(),
      [
        "https://example.com/help?utm_content=issue_help",
        "https://github.com/example/handbook",
      ].sort(),
    )
    assert.ok(externalUrls(root, true).includes(`${blob}examples/sample.md#sample`))
    rmSync(join(root, "examples/sample.md"))
    assert.throws(() => checkLocal(root), /missing destination/)
    writeFileSync(join(root, "examples/sample.md"), "# Renamed\n")
    assert.throws(() => checkLocal(root), /missing anchor/)
    writeFileSync(join(root, "llms.txt"), `[Escape](${blob}%2e%2e/)`)
    assert.throws(() => checkLocal(root), /escapes handbook/)
    writeFileSync(join(root, "llms.txt"), "# Index\n")
    writeFileSync(join(root, ".github/ISSUE_TEMPLATE/config.yml"), "bad: [unterminated")
    assert.throws(() => checkLocal(root))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("heading anchors use rendered text rather than Markdown syntax", () => {
  const { anchors } = navigation(
    "# [Read this](guide.md)\n# snake_case\n# `foo_bar`\n# A &amp; B\n# **Read this**",
  )
  assert.deepEqual([...anchors], ["read-this", "snake_case", "foo_bar", "a--b", "read-this-1"])
})

test("generation detects stale output and validates every target before writing", () => {
  const root = mkdtempSync(join(tmpdir(), "handbook-generation-"))
  const source = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  try {
    for (const name of ["README.md", "resources.json", "sections.json", "workflows"])
      cpSync(join(source, name), join(root, name), { recursive: true })
    generate(root)
    const readme = join(root, "README.md")
    const stale = readFileSync(readme, "utf8").replace(
      "<!-- resources:start -->",
      "<!-- resources:start -->\nStale generated text",
    )
    writeFileSync(readme, stale)
    assert.throws(() => generate(root), /Stale generated content/)
    const workflow = join(root, "workflows", "prepare-a-handoff.md")
    const valid = readFileSync(workflow, "utf8")
    writeFileSync(workflow, valid.replace("<!-- next-steps:end -->", ""))
    assert.throws(() => generate(root, true), /marker pair/)
    assert.equal(readFileSync(readme, "utf8"), stale)
    writeFileSync(workflow, valid)
    generate(root, true)
    generate(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("sections place every resource once and render groups as named rows", () => {
  const resources = parseResources([
    { ...row, id: "a", section: "Tools" },
    { ...row, id: "b", section: "Tools" },
    { ...row, id: "c", section: "Terms", title: "Fountain" },
  ])
  const valid = [
    {
      name: "Tools",
      intro: "Free tools.",
      layout: "table",
      groupLabel: "Job",
      itemLabel: "Tools",
      groups: [{ name: "Check a file", ids: ["b", "a"] }],
    },
    { name: "Terms", intro: "Definitions.", layout: "links" },
  ]
  const sections = parseSections(valid, resources)
  const output = directory(resources, sections)
  assert.match(output, /^\*\*Jump to:\*\* \[Tools\]\(#tools\) · \[Terms\]\(#terms\)/)
  // A group is one row, its resources in the group's own order with their
  // descriptions as hover titles.
  assert.match(
    output,
    /\| Job \| Tools \|\n\|---\|---\|\n\| \*\*Check a file\*\* \| \[Example\]\([^)]*directory_b "Example"\) · \[Example\]\([^)]*directory_a "Example"\) \|/,
  )
  assert.match(output, /### Terms\n\nDefinitions\.\n\n\[Fountain\]\([^)]*directory_c "Example"\)$/)
  assert.equal(navigation(output).links.length, 5)
  // A quote would end the hover title early.
  assert.throws(
    () => parseResources([{ ...row, description: 'The "best" tool' }]),
    /unsafe Markdown text/,
  )
  const tools = valid[0] ?? assert.fail()
  for (const [broken, message] of [
    [[tools], /missing from sections.json: Terms/],
    [[...valid, { name: "Empty", intro: "None.", layout: "table" }], /Empty: no resources/],
    [[{ ...tools, groups: [{ name: "One", ids: ["a"] }] }, valid[1]], /ungrouped b/],
    [[{ ...tools, groups: [{ name: "One", ids: ["a", "b", "a"] }] }, valid[1]], /in two groups/],
    [
      [{ ...tools, groups: [{ name: "One", ids: ["a", "b", "c"] }] }, valid[1]],
      /c is not in this section/,
    ],
    [[{ ...tools, layout: "links" }, valid[1]], /only a table can be grouped/],
    [[{ ...tools, intro: "Use **bold**" }, valid[1]], /unsafe Markdown/],
    [[{ ...tools, itemLabel: undefined }, valid[1]], /itemLabel: missing text/],
    [[tools, tools, valid[1]], /listed twice/],
  ] as const)
    assert.throws(() => parseSections(broken, resources), message)
})
