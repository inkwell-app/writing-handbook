import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { checkLocal, checkUrl, externalUrls, generate } from "./catalog.ts"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
try {
  const [command, ...extra] = process.argv.slice(2)
  const published = command === "links" && extra.length === 1 && extra[0] === "--published"
  if ((extra.length && !published) || !["check", "generate", "links"].includes(command ?? ""))
    throw new Error("Usage: node src/cli.ts check|generate|links [--published for links]")
  generate(root, command === "generate")
  checkLocal(root)
  if (command === "links") {
    const urls = externalUrls(root, published)
    const results: unknown[] = []
    let failures = 0
    for (let offset = 0; offset < urls.length; offset += 5) {
      const batch = await Promise.all(
        urls.slice(offset, offset + 5).map(async (url) => {
          try {
            return await checkUrl(url)
          } catch (error) {
            failures++
            return { url, error: error instanceof Error ? error.message : String(error) }
          }
        }),
      )
      results.push(...batch)
    }
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
    if (failures) throw new Error(`${failures} destinations failed; inspect the JSON results`)
  }
  process.stderr.write("Handbook catalog and navigation checks passed\n")
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
