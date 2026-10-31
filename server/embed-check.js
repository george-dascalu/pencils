import dns from "node:dns/promises";
import net from "node:net";
import { Problem } from "./problem.js";

// Whether a web page may be shown in Home's Web page panel: a site that forbids framing gets a link
// card instead of a blank frame. The server fetches only the page's head, follows a few redirects
// while refusing private and local addresses (and the app's own origin) at every hop, and reads
// the title for the card.
const first = (value) => String(value || "").split(",")[0];
export function framingAllowed(headers) {
  const get = (name) => String((typeof headers?.get === "function" ? headers.get(name) : headers?.[name]) || "");
  const options = get("x-frame-options").toLowerCase().split(",").map((v) => v.trim());
  if (options.some((v) => v === "deny" || v === "sameorigin")) return false;
  const ancestors = /frame-ancestors([^;]*)/i.exec(get("content-security-policy"));
  return !ancestors || ancestors[1].trim().toLowerCase().split(/\s+/).includes("*");
}
// The eight hextets of an IPv6 address, or null; a trailing dotted IPv4 counts as two hextets.
function hextets(ip) {
  let text = ip.toLowerCase(), tail = [];
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    tail = [(a << 8) | b, (c << 8) | d];
    text = text.slice(0, dotted.index);
  }
  const [head, rest = ""] = text.split("::");
  const parse = (part) => (part ? part.split(":").filter(Boolean).map((h) => parseInt(h, 16)) : []);
  const left = parse(head), right = [...parse(rest), ...tail];
  if (text.includes("::")) return [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill(0), ...right];
  const all = [...left, ...right];
  return all.length === 8 ? all : null;
}
const privateV4 = ([a, b]) =>
  a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
export function privateAddress(ip) {
  if (net.isIPv4(ip)) return privateV4(ip.split(".").map(Number));
  if (!net.isIPv6(ip)) return true;
  const h = hextets(ip.replace(/%.*$/, ""));
  if (!h) return true;
  const v4 = (i) => [h[i] >> 8, h[i] & 255, h[i + 1] >> 8, h[i + 1] & 255];
  const zero = (count) => h.slice(0, count).every((x) => x === 0);
  if (zero(5) && h[5] === 0xffff) return privateV4(v4(6)); // IPv4-mapped, dotted or hex
  if (zero(6)) return true; // ::, ::1 and IPv4-compatible
  if (h[0] === 0x64 && h[1] === 0xff9b && zero(6).valueOf() === false && h.slice(2, 6).every((x) => x === 0)) return privateV4(v4(6)); // NAT64
  if ((h[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}
async function readSome(response, limit) {
  if (!response.body?.getReader) return (await response.text()).slice(0, limit);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let text = "";
  while (text.length < limit) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return text.slice(0, limit);
}
export async function checkEmbed(url, { fetch: doFetch = globalThis.fetch, lookup = (host) => dns.lookup(host, { all: true }), allowPrivate = false, self = "" } = {}) {
  let target;
  try {
    target = new URL(String(url));
  } catch {
    throw new Problem(400, "Enter a full web address.");
  }
  const guard = async (address) => {
    if (!["http:", "https:"].includes(address.protocol)) throw new Problem(400, "Only http and https pages can be shown.");
    if (self && address.host.toLowerCase() === self.toLowerCase()) throw new Problem(400, "Pencils' own pages can't be shown in a panel.");
    if (allowPrivate) return;
    const host = address.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Problem(400, "Private and local addresses can't be shown here.");
    const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host).catch(() => { throw new Problem(400, "That address could not be found."); });
    if (!addresses.length || addresses.some((a) => privateAddress(a.address))) throw new Problem(400, "Private and local addresses can't be shown here.");
  };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
  try {
    for (let hop = 0; hop < 4; hop++) {
      await guard(target);
      const response = await doFetch(target, { redirect: "manual", signal: controller.signal, headers: { accept: "text/html,*/*;q=0.5" } });
      const location = [301, 302, 303, 307, 308].includes(response.status) && response.headers.get("location");
      if (location) {
        response.body?.cancel?.().catch?.(() => {});
        target = new URL(location, target);
        continue;
      }
      const embeddable = framingAllowed(response.headers);
      let title = "";
      if (/html/i.test(first(response.headers.get("content-type")))) {
        const match = /<title[^>]*>([^<]{1,200})/i.exec(await readSome(response, 65536));
        title = match ? match[1].replace(/\s+/g, " ").trim() : "";
      } else response.body?.cancel?.().catch?.(() => {});
      return { embeddable, title };
    }
    throw new Problem(400, "That page redirects too often.");
  } catch (error) {
    if (error instanceof Problem) throw error;
    throw new Problem(400, "That page could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}
