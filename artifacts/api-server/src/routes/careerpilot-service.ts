import { createHash } from "node:crypto";
import { isIP } from "node:net";

export interface CareerSearchInput {
  query: string;
  role?: string | null;
  location?: string | null;
  opportunityType: "internship" | "full-time" | "both";
  experienceLevel?: string | null;
  skills?: string[];
  degree?: string | null;
  branch?: string | null;
  graduationYear?: number | null;
  targetCompanies?: string[];
  preferredIndustries?: string[];
  workAuthorization?: string | null;
  workArrangement?: "remote" | "hybrid" | "onsite" | null;
  minimumCompensation?: number | null;
  minimumCompensationCurrency?: string | null;
  minimumCompensationPeriod?: "hourly" | "monthly" | "annual" | "total" | null;
  visaSponsorship?: "offered" | "not-offered" | "any" | null;
}

export interface ListingVerificationInput {
  url: string;
  title: string;
  company: string;
  applicationUrl?: string | null;
}

interface TinyFishSearchResult {
  position?: number;
  site_name?: string;
  title?: string;
  snippet?: string;
  url?: string;
}

interface SearchCandidate {
  title: string;
  siteName: string;
  snippet: string;
  url: string;
}

interface FetchPage {
  url: string;
  final_url?: string;
  title?: string;
  description?: string;
  text?: string | Record<string, unknown>;
}

interface FetchError {
  url?: string;
  error?: string;
}

interface TinyFishFetchPayload {
  results?: FetchPage[];
  errors?: FetchError[];
}

interface MatchFactor {
  label: string;
  status: "matched" | "mismatch" | "unknown";
  explanation: string;
  points: number;
}

interface JobListing {
  id: string;
  canonicalUrl: string;
  title: string;
  company: string;
  companyUrl: string | null;
  applicationUrl: string | null;
  sourceName: string;
  sourceUrl: string;
  description: string | null;
  location: string | null;
  workArrangement: "remote" | "hybrid" | "onsite" | null;
  employmentType:
    | "internship"
    | "full-time"
    | "part-time"
    | "contract"
    | "temporary"
    | "unknown";
  experienceLevel: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  educationRequirements: string | null;
  graduationYearRequirements: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  payPeriod: "hourly" | "monthly" | "annual" | "total" | null;
  postedAt: string | null;
  deadline: string | null;
  visaSponsorship: "offered" | "unavailable" | "not-specified" | "confirm";
  workAuthorization: string | null;
  lastCheckedAt: string;
  listingStatus:
    | "verified"
    | "verification-needed"
    | "possibly-expired"
    | "closed"
    | "conflicting";
  verificationConfidence: number;
  verificationNote: string;
  matchScore: number;
  matchExplanation: string;
  matchBreakdown: MatchFactor[];
  alternativeSources: string[];
}

class TinyFishError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "TinyFishError";
    this.status = status;
  }
}

const SEARCH_URL = "https://api.search.tinyfish.ai/";
const FETCH_URL = "https://api.fetch.tinyfish.ai/";
const AGENT_URL = "https://agent.tinyfish.ai/v1/automation/run";
const CAREER_DOMAINS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "careers.smartrecruiters.com",
  "myworkdayjobs.com",
  "amazon.jobs",
];

function apiKey(): string {
  const key = process.env.TINYFISH_API_KEY?.trim();
  if (!key) {
    throw new TinyFishError(
      "TinyFish is not configured. Add TINYFISH_API_KEY in Replit Secrets.",
      503,
    );
  }
  return key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function responseMessage(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const error = body.error;
  if (typeof error === "string") return error;
  if (isRecord(error)) return stringValue(error.message);
  return stringValue(body.message);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function tinyFishHttpError(response: Response, body: unknown): TinyFishError {
  if (response.status === 401) {
    return new TinyFishError(
      "TinyFish rejected the saved API key. Check or replace TINYFISH_API_KEY in Replit Secrets.",
    );
  }
  if (response.status === 402 || response.status === 403) {
    return new TinyFishError(
      "TinyFish could not run this request because the account may need an active plan or available credits. Check the TinyFish account and try again.",
    );
  }
  if (response.status === 429) {
    return new TinyFishError(
      "TinyFish is rate-limiting requests right now. Wait a moment and retry.",
      429,
    );
  }
  return new TinyFishError(
    responseMessage(body) ??
      `TinyFish returned HTTP ${response.status}. Try again in a moment.`,
  );
}

async function tinyFishRequest(
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(35_000),
      headers: {
        "X-API-Key": apiKey(),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new TinyFishError(
        "TinyFish took too long to respond. Keep any results already found and retry the search.",
      );
    }
    throw new TinyFishError(
      "CareerPilot could not reach TinyFish. Check the network and retry.",
    );
  }

  const body = await readJson(response);
  if (!response.ok) throw tinyFishHttpError(response, body);
  return body;
}

function searchPayload(body: unknown): TinyFishSearchResult[] {
  if (!isRecord(body) || !Array.isArray(body.results)) {
    throw new TinyFishError("TinyFish returned an unexpected search response.");
  }
  return body.results.filter(isRecord) as TinyFishSearchResult[];
}

function extractCountryCode(location: string | null | undefined): string | null {
  if (!location) return null;
  const value = normalize(location);
  const countries: Array<[string, string[]]> = [
    ["IN", ["india", "bengaluru", "bangalore", "delhi", "new delhi", "mumbai", "hyderabad", "pune", "chennai", "noida", "gurugram", "gurgaon", "kolkata", "ahmedabad"]],
    ["US", ["united states", "usa", "new york", "san francisco", "seattle", "austin", "boston", "chicago", "los angeles", "washington dc"]],
    ["GB", ["united kingdom", "uk", "london", "manchester", "cambridge", "edinburgh"]],
    ["CA", ["canada", "toronto", "vancouver", "montreal", "ottawa"]],
    ["AU", ["australia", "sydney", "melbourne", "brisbane", "perth"]],
    ["SG", ["singapore"]],
    ["DE", ["germany", "berlin", "munich", "hamburg"]],
    ["IE", ["ireland", "dublin"]],
    ["NL", ["netherlands", "amsterdam", "rotterdam"]],
    ["FR", ["france", "paris", "lyon"]],
  ];
  return countries.find(([, hints]) => hints.some((hint) => value.includes(hint)))?.[0] ?? null;
}

function buildSearchQueries(input: CareerSearchInput): Array<{
  query: string;
  domains?: string;
}> {
  const role = input.role?.trim() || input.query.trim();
  const location = input.location?.trim();
  const type =
    input.opportunityType === "both" ? "job or internship" : input.opportunityType;
  const skills = input.skills?.filter(Boolean).slice(0, 8).join(" ");
  const industries = input.preferredIndustries?.filter(Boolean).slice(0, 5).join(" ");
  const base = [role, type, location, skills, industries].filter(Boolean).join(" ");
  const queries = [
    { query: `${base} career openings apply company job listing` },
    {
      query: `${base} official careers jobs`,
      domains: CAREER_DOMAINS.join(","),
    },
  ];
  if (input.targetCompanies?.length) {
    queries.push({
      query: `${base} ${input.targetCompanies.slice(0, 8).join(" ")} official careers`,
    });
  }
  return queries;
}

async function searchTinyFish(
  query: { query: string; domains?: string },
  input: CareerSearchInput,
): Promise<TinyFishSearchResult[]> {
  const params = new URLSearchParams({
    query: query.query.slice(0, 2000),
    purpose:
      "Find current company career-page or job portal listings that match the user's stated role, location, opportunity type, and skills. Return job listing URLs, not general career advice.",
    domain_type: "web",
    page: "0",
  });
  const countryCode = extractCountryCode(input.location);
  if (countryCode) params.set("location", countryCode);
  if (query.domains) params.set("include_domains", query.domains);
  const body = await tinyFishRequest(`${SEARCH_URL}?${params.toString()}`, {
    method: "GET",
  });
  return searchPayload(body);
}

function validPublicUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "metadata.google.internal" ||
      hostname === "metadata.google"
    ) {
      return null;
    }
    const ipVersion = isIP(hostname);
    if (ipVersion === 4) {
      const parts = hostname.split(".").map(Number);
      const [a, b] = parts;
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)
      ) {
        return null;
      }
    }
    if (ipVersion === 6) return null;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalizeUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref|source)/i.test(key)) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

function candidateFromResult(result: TinyFishSearchResult): SearchCandidate | null {
  const title = stringValue(result.title);
  const safeUrl = typeof result.url === "string" ? validPublicUrl(result.url) : null;
  if (!title || !safeUrl) return null;
  return {
    title,
    siteName: stringValue(result.site_name) ?? new URL(safeUrl).hostname,
    snippet: stringValue(result.snippet) ?? "",
    url: canonicalizeUrl(safeUrl),
  };
}

function candidateIsRelevant(candidate: SearchCandidate, input: CareerSearchInput): boolean {
  const combined = normalize(`${candidate.title} ${candidate.snippet} ${candidate.url}`);
  const jobSignals = /\b(job|jobs|intern|internship|career|opening|role|apply|position|graduate|hiring)\b/.test(
    combined,
  );
  const terms = (input.skills ?? [])
    .concat(input.role?.trim() ? input.role.trim().split(/\s+/) : [])
    .map(normalize)
    .filter((term) => term.length > 2);
  const overlaps = terms.filter((term) => combined.includes(term));
  const companyMatch =
    !input.targetCompanies?.length ||
    input.targetCompanies.some((company) => combined.includes(normalize(company)));
  return jobSignals && companyMatch && (terms.length === 0 || overlaps.length > 0);
}

function companyFromCandidate(candidate: SearchCandidate): string {
  const url = new URL(candidate.url);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const knownCompanies: Record<string, string> = {
    "amazon.jobs": "Amazon",
    "careers.google.com": "Google",
    "jobs.careers.microsoft.com": "Microsoft",
    "careers.microsoft.com": "Microsoft",
    "careers.nvidia.com": "NVIDIA",
    "careers.atlassian.com": "Atlassian",
    "careers.apple.com": "Apple",
    "careers.netflix.com": "Netflix",
    "careers.adobe.com": "Adobe",
    "careers.ibm.com": "IBM",
  };
  if (knownCompanies[host]) return knownCompanies[host];

  const firstSegment = url.pathname.split("/").filter(Boolean)[0];
  if (
    host.includes("greenhouse.io") ||
    host === "jobs.lever.co" ||
    host === "jobs.ashbyhq.com" ||
    host === "careers.smartrecruiters.com"
  ) {
    if (firstSegment) {
      return firstSegment
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }
  }
  const subdomain = host.split(".")[0];
  if (/^(myworkdayjobs|workdayjobs|careers|jobs|boards|job-boards)$/i.test(subdomain)) {
    return candidate.siteName || "Company";
  }
  const companyFromHost = host.split(".")[0];
  return companyFromHost
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceIsAggregator(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return [
    "linkedin.com",
    "indeed.com",
    "glassdoor.com",
    "ziprecruiter.com",
    "monster.com",
    "jooble.org",
    "simplyhired.com",
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function companyHomeUrl(candidate: SearchCandidate): string | null {
  if (sourceIsAggregator(candidate.url)) return null;
  const host = new URL(candidate.url).hostname.toLowerCase();
  if (
    host.includes("greenhouse.io") ||
    host === "jobs.lever.co" ||
    host === "jobs.ashbyhq.com" ||
    host === "careers.smartrecruiters.com" ||
    host.includes("workdayjobs.com")
  ) {
    return null;
  }
  const home = new URL(candidate.url);
  home.pathname = "/";
  home.search = "";
  home.hash = "";
  return home.toString();
}

function pageText(page: FetchPage | undefined): string {
  if (!page) return "";
  if (typeof page.text === "string") return page.text.slice(0, 10_000);
  if (isRecord(page.text)) return JSON.stringify(page.text).slice(0, 10_000);
  return "";
}

function fetchPayload(body: unknown): TinyFishFetchPayload {
  if (!isRecord(body)) {
    throw new TinyFishError("TinyFish returned an unexpected page-fetch response.");
  }
  return {
    results: Array.isArray(body.results)
      ? body.results.flatMap((value): FetchPage[] => {
          if (!isRecord(value)) return [];
          const url = stringValue(value.url);
          if (!url) return [];
          const text =
            typeof value.text === "string"
              ? value.text
              : isRecord(value.text)
                ? value.text
                : undefined;
          return [
            {
              url,
              final_url: stringValue(value.final_url) ?? undefined,
              title: stringValue(value.title) ?? undefined,
              description: stringValue(value.description) ?? undefined,
              text,
            },
          ];
        })
      : [],
    errors: Array.isArray(body.errors)
      ? (body.errors.filter(isRecord) as FetchError[])
      : [],
  };
}

async function fetchTinyFishPages(
  urls: string[],
  purpose: string,
  ttl: number,
): Promise<TinyFishFetchPayload> {
  const uniqueUrls = [...new Set(urls.map(validPublicUrl).filter((url): url is string => !!url))].slice(
    0,
    10,
  );
  if (!uniqueUrls.length) return { results: [], errors: [] };
  const body = await tinyFishRequest(FETCH_URL, {
    method: "POST",
    body: JSON.stringify({
      urls: uniqueUrls,
      format: "markdown",
      ttl,
      purpose,
    }),
  });
  return fetchPayload(body);
}

function mapByUrl(payload: TinyFishFetchPayload): Map<string, FetchPage> {
  const map = new Map<string, FetchPage>();
  for (const page of payload.results ?? []) {
    const safeUrl = page.url ? validPublicUrl(page.url) : null;
    if (!safeUrl) continue;
    map.set(canonicalizeUrl(safeUrl), page);
    if (page.final_url) {
      const finalUrl = validPublicUrl(page.final_url);
      if (finalUrl) map.set(canonicalizeUrl(finalUrl), page);
    }
  }
  return map;
}

function findFetchError(payload: TinyFishFetchPayload, url: string): string | null {
  const target = canonicalizeUrl(url);
  return (
    payload.errors?.find((item) => {
      const errorUrl = item.url ? validPublicUrl(item.url) : null;
      return errorUrl ? canonicalizeUrl(errorUrl) === target : false;
    })?.error ?? null
  );
}

function applyUrlFromContent(content: string, fallbackUrl: string): string | null {
  const matches = content.matchAll(
    /\[(?:apply(?:\s+now|\s+here|\s+for\s+this\s+job)?|submit\s+application|start\s+application)[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi,
  );
  for (const match of matches) {
    const url = validPublicUrl(match[1]);
    if (url) return url;
  }
  const path = new URL(fallbackUrl).pathname;
  if (
    path.split("/").filter(Boolean).length >= 2 &&
    !/\/(careers?|jobs?|openings?)\/?$/i.test(path)
  ) {
    return fallbackUrl;
  }
  return null;
}

function extractWorkArrangement(text: string): "remote" | "hybrid" | "onsite" | null {
  if (/\bremote\b/i.test(text)) return "remote";
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\b(on[- ]?site|in[- ]office|office[- ]based)\b/i.test(text)) return "onsite";
  return null;
}

function extractEmploymentType(
  text: string,
): JobListing["employmentType"] {
  if (/\b(intern(ship)?|co[- ]?op)\b/i.test(text)) return "internship";
  if (/\bfull[- ]?time\b/i.test(text)) return "full-time";
  if (/\bpart[- ]?time\b/i.test(text)) return "part-time";
  if (/\b(contract|contractor|fixed[- ]term)\b/i.test(text)) return "contract";
  if (/\b(temporary|temp role)\b/i.test(text)) return "temporary";
  return "unknown";
}

function extractExperience(text: string): string | null {
  if (/\b(fresher|freshers|entry[- ]level|new grad|recent graduate)\b/i.test(text)) {
    return "Entry level / fresher";
  }
  const years = text.match(/\b(\d{1,2})\s*(?:to|-|–)\s*(\d{1,2})\s*years?\s+(?:of\s+)?experience\b/i);
  if (years) return `${years[1]}–${years[2]} years`;
  const minimum = text.match(/\b(\d{1,2})\+?\s*years?\s+(?:of\s+)?experience\b/i);
  if (minimum) return `${minimum[1]}+ years`;
  return null;
}

function extractLocation(text: string, preferredLocation: string | null | undefined): string | null {
  if (preferredLocation && normalize(text).includes(normalize(preferredLocation))) {
    return preferredLocation;
  }
  const knownPlaces = [
    "Bengaluru",
    "Bangalore",
    "Delhi",
    "New Delhi",
    "Mumbai",
    "Hyderabad",
    "Pune",
    "Chennai",
    "Noida",
    "Gurugram",
    "Gurgaon",
    "Kolkata",
    "Ahmedabad",
    "New York",
    "San Francisco",
    "Seattle",
    "Austin",
    "Boston",
    "London",
    "Toronto",
    "Vancouver",
    "Singapore",
    "Dublin",
    "Berlin",
    "Sydney",
    "Melbourne",
  ];
  return knownPlaces.find((place) => new RegExp(`\\b${place.replace(" ", "\\s+")}\\b`, "i").test(text)) ?? null;
}

function extractSkills(
  text: string,
  userSkills: string[],
): { required: string[]; preferred: string[] } {
  const commonSkills = [
    "Python",
    "Java",
    "JavaScript",
    "TypeScript",
    "C++",
    "C#",
    "SQL",
    "React",
    "Node.js",
    "AWS",
    "Azure",
    "GCP",
    "Machine Learning",
    "Data Analysis",
    "Excel",
    "Figma",
    "Product Management",
    "Communication",
    "Git",
    "Docker",
    "Kubernetes",
    "HTML",
    "CSS",
    "Go",
    "Rust",
    "Linux",
    "Tableau",
    "Power BI",
    "Statistics",
    "Deep Learning",
    "TensorFlow",
    "PyTorch",
  ];
  const candidates = [...new Set([...commonSkills, ...userSkills])];
  const found = candidates.filter((skill) =>
    new RegExp(
      `(^|[^a-z0-9+#])${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9+#]|$)`,
      "i",
    ).test(text),
  );
  const preferredContext = /preferred qualifications|preferred skills|nice to have|bonus points|desired skills/i.test(
    text,
  );
  const requiredContext = /required qualifications|required skills|minimum qualifications|must have|requirements:/i.test(
    text,
  );
  return {
    required: requiredContext && !preferredContext ? found : [],
    preferred: preferredContext ? found : [],
  };
}

function extractEducation(text: string): string | null {
  const match = text.match(
    /(?:education|degree|academic qualifications|minimum qualifications)[\s:—-]{0,18}([^\n.]{8,260})/i,
  );
  return match?.[1]?.trim() ?? null;
}

function extractGraduationRequirement(text: string): string | null {
  const match = text.match(
    /((?:graduat(?:e|ion)\s+(?:year|by|between)|class of)\s*(?:20\d{2}(?:\s*(?:-|–|to)\s*20\d{2})?))/i,
  );
  return match?.[1]?.trim() ?? null;
}

function extractAuthorization(text: string): string | null {
  const match = text.match(
    /(?:authorized to work|work authorization|legally authorized|sponsorship)[^.!\n]{0,180}/i,
  );
  return match?.[0]?.trim() ?? null;
}

function extractVisaStatus(
  text: string,
): JobListing["visaSponsorship"] {
  if (/\b(visa sponsorship (?:is )?(?:available|offered)|will sponsor (?:a )?visa|sponsor(?:s|ing)? work visas)\b/i.test(text)) {
    return "offered";
  }
  if (/\b(no visa sponsorship|sponsorship (?:is )?not (?:available|provided)|unable to sponsor|will not sponsor)\b/i.test(text)) {
    return "unavailable";
  }
  if (/\b(contact (?:the )?(?:recruiter|employer)|confirm (?:work authorization|sponsorship))\b/i.test(text)) {
    return "confirm";
  }
  return "not-specified";
}

function extractCompensation(text: string): {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: JobListing["payPeriod"];
} {
  const match = text.match(
    /([$₹€£])\s?([\d,]+)(?:\s*(?:-|–|—|to)\s*[$₹€£]?\s?([\d,]+))?/,
  );
  if (!match) return { min: null, max: null, currency: null, period: null };
  const parseNumber = (value?: string) =>
    value ? Number(value.replace(/,/g, "")) : null;
  const amountStart = Math.max(0, match.index ?? 0);
  const context = text.slice(Math.max(0, amountStart - 50), amountStart + match[0].length + 70);
  const period = /\b(hour|hourly|per hour)\b/i.test(context)
    ? "hourly"
    : /\b(month|monthly|per month|\/mo)\b/i.test(context)
      ? "monthly"
      : /\b(year|annual|annually|per year|\/yr)\b/i.test(context)
        ? "annual"
        : null;
  const currency = { "₹": "INR", $: "USD", "€": "EUR", "£": "GBP" }[match[1]];
  return {
    min: parseNumber(match[2]),
    max: parseNumber(match[3]) ?? parseNumber(match[2]),
    currency: currency ?? null,
    period,
  };
}

function extractDeadline(text: string): string | null {
  const context = text.match(
    /(?:apply by|application deadline|apply before|closes on|closing date)[\s:—-]{0,20}([^\n.]{4,50})/i,
  );
  if (!context) return null;
  const isoDate = context[1].match(/\b20\d{2}-\d{2}-\d{2}\b/);
  if (isoDate) return isoDate[0];
  const parsed = Date.parse(context[1]);
  return Number.isNaN(parsed) ? context[1].trim() : new Date(parsed).toISOString();
}

function extractPostedAt(text: string): string | null {
  const relative = text.match(
    /(?:posted|published)\s+(today|yesterday|\d{1,3}\s+days?\s+ago|\d{1,2}\s+weeks?\s+ago|\d{1,2}\s+months?\s+ago)\b/i,
  );
  if (relative) {
    const value = relative[1].toLowerCase();
    const days = value === "today"
      ? 0
      : value === "yesterday"
        ? 1
        : Number(value.match(/\d+/)?.[0] ?? 0) *
          (value.includes("month") ? 30 : value.includes("week") ? 7 : 1);
    return new Date(Date.now() - days * 86_400_000).toISOString();
  }
  const explicit = text.match(
    /(?:posted|published|date posted)\s+(?:on\s+)?((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}|20\d{2}-\d{2}-\d{2})/i,
  );
  if (!explicit) return null;
  const parsed = Date.parse(explicit[1]);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function explicitClosed(text: string): string | null {
  const match = text.match(
    /\b(no longer accepting applications|applications are closed|job posting (?:has )?closed|position (?:has been )?(?:filled|closed)|role (?:is )?closed|this job is expired|listing has expired)\b[^.\n]*/i,
  );
  return match?.[0]?.trim() ?? null;
}

function explicitOpen(text: string): string | null {
  const match = text.match(
    /\b(apply now|apply for this job|submit application|start application|applications are open)\b[^.\n]*/i,
  );
  return match?.[0]?.trim() ?? null;
}

function similarityRatio(text: string, terms: string[]): number {
  if (!terms.length) return 0;
  const normalized = normalize(text);
  const matched = terms.filter((term) => {
    const normalizedTerm = normalize(term);
    return normalized.includes(normalizedTerm) ||
      normalizedTerm.split(" ").some((part) => part.length > 2 && normalized.includes(part));
  });
  return matched.length / terms.length;
}

function scoreListing(
  title: string,
  text: string,
  location: string | null,
  arrangement: JobListing["workArrangement"],
  type: JobListing["employmentType"],
  experience: string | null,
  graduation: string | null,
  education: string | null,
  authorization: string | null,
  visa: JobListing["visaSponsorship"],
  compensation: ReturnType<typeof extractCompensation>,
  input: CareerSearchInput,
): { score: number; breakdown: MatchFactor[]; explanation: string } {
  const factors: MatchFactor[] = [];
  let earned = 0;
  let possible = 0;
  const add = (
    label: string,
    status: MatchFactor["status"],
    explanation: string,
    weight: number,
  ) => {
    factors.push({
      label,
      status,
      explanation,
      points: status === "matched" ? weight : 0,
    });
    if (status !== "unknown") {
      possible += weight;
      if (status === "matched") earned += weight;
    }
  };

  const role = input.role?.trim() || input.query.trim();
  const roleTerms = role
    .split(/[\s,./-]+/)
    .filter((term) => term.length > 2 && !/^(job|jobs|role|career|careers|intern|internship|for|with|the|and|in|at|to|202\d)$/i.test(term));
  if (roleTerms.length) {
    const titleOverlap = similarityRatio(title, roleTerms);
    const fullOverlap = similarityRatio(`${title} ${text.slice(0, 2500)}`, roleTerms);
    const overlap = Math.max(titleOverlap, fullOverlap * 0.8);
    add(
      "Role relevance",
      overlap >= 0.5 ? "matched" : overlap > 0 ? "mismatch" : "mismatch",
      overlap > 0
        ? `${Math.round(overlap * roleTerms.length)} of ${roleTerms.length} role keywords appear in the listing.`
        : "The listing title and description do not contain the requested role keywords.",
      35,
    );
  }

  const skills = [...new Set((input.skills ?? []).map((skill) => skill.trim()).filter(Boolean))];
  if (skills.length) {
    const hits = skills.filter((skill) => normalize(text).includes(normalize(skill)));
    add(
      "Skills",
      hits.length ? "matched" : "mismatch",
      `${hits.length} of ${skills.length} selected skills appear in the fetched listing text.`,
      25,
    );
  }

  if (input.location?.trim()) {
    if (!location && !arrangement) {
      add("Location", "unknown", "The listing does not confirm a location or remote arrangement.", 15);
    } else if (location && normalize(location).includes(normalize(input.location))) {
      add("Location", "matched", `The listing names ${input.location} as a location.`, 15);
    } else if (arrangement === "remote") {
      add("Location", "matched", "The listing states the role is remote; confirm geographic restrictions with the employer.", 15);
    } else if (location) {
      add("Location", "mismatch", `The listing names ${location}; your preferred location is ${input.location}.`, 15);
    }
  }

  if (input.opportunityType !== "both") {
    if (type === "unknown") {
      add("Opportunity type", "unknown", "The listing does not clearly state internship or full-time status.", 10);
    } else {
      const matches =
        (input.opportunityType === "internship" && type === "internship") ||
        (input.opportunityType === "full-time" && type === "full-time");
      add(
        "Opportunity type",
        matches ? "matched" : "mismatch",
        `The listing identifies this as ${type.replace("-", " ")}.`,
        10,
      );
    }
  }

  if (input.experienceLevel?.trim()) {
    if (!experience) {
      add("Experience level", "unknown", "The listing does not confirm an experience level.", 10);
    } else {
      const matches =
        normalize(experience).includes(normalize(input.experienceLevel)) ||
        (/fresher|entry|graduate/i.test(input.experienceLevel) && /entry|fresher/i.test(experience));
      add(
        "Experience level",
        matches ? "matched" : "mismatch",
        `The listing states ${experience}.`,
        10,
      );
    }
  }

  if (input.workArrangement) {
    if (!arrangement) {
      add("Work arrangement", "unknown", "The listing does not specify remote, hybrid, or on-site work.", 5);
    } else {
      const matches = arrangement === input.workArrangement;
      add(
        "Work arrangement",
        matches ? "matched" : "mismatch",
        `The listing specifies ${arrangement === "onsite" ? "on-site" : arrangement} work.`,
        5,
      );
    }
  }

  if (input.graduationYear) {
    if (!graduation) {
      add("Graduation year", "unknown", "The listing does not specify eligible graduation years.", 5);
    } else {
      const matches = graduation.includes(String(input.graduationYear));
      add(
        "Graduation year",
        matches ? "matched" : "mismatch",
        matches
          ? `The listing mentions ${input.graduationYear}.`
          : `The listing states “${graduation}”; your year is ${input.graduationYear}.`,
        5,
      );
    }
  }

  if (input.degree?.trim()) {
    if (!education) {
      add("Education", "unknown", "The listing does not state an education requirement to compare.", 5);
    } else {
      const degreeTerms = input.degree.split(/\s+/).filter(term => term.length > 2);
      const matches = normalize(education).includes(normalize(input.degree)) ||
        similarityRatio(education, degreeTerms) >= 0.5;
      add(
        "Education",
        matches ? "matched" : "mismatch",
        `The listing states “${education}”; compare this with your supplied degree details.`,
        5,
      );
    }
  }

  if (input.branch?.trim()) {
    if (!education) {
      add("Branch / specialization", "unknown", "The listing does not state a field-of-study requirement.", 5);
    } else {
      const branchTerms = input.branch.split(/\s+/).filter(term => term.length > 2);
      const matches = normalize(education).includes(normalize(input.branch)) ||
        similarityRatio(education, branchTerms) >= 0.5;
      add(
        "Branch / specialization",
        matches ? "matched" : "mismatch",
        `The listing states “${education}”; compare this with your supplied branch or specialization.`,
        5,
      );
    }
  }

  if (input.preferredIndustries?.length) {
    const matchingIndustries = input.preferredIndustries.filter(industry =>
      normalize(text).includes(normalize(industry)),
    );
    add(
      "Preferred industry",
      matchingIndustries.length ? "matched" : "unknown",
      matchingIndustries.length
        ? `The listing text mentions ${matchingIndustries.join(", ")}.`
        : "The listing does not clearly identify an industry, so this preference is unconfirmed.",
      5,
    );
  }

  if (input.workAuthorization?.trim()) {
    if (!authorization) {
      add("Work authorization", "unknown", "The listing does not confirm its work-authorization requirements.", 5);
    } else {
      const terms = input.workAuthorization.split(/\s+/).filter(term => term.length > 2);
      const matches = normalize(authorization).includes(normalize(input.workAuthorization)) ||
        similarityRatio(authorization, terms) >= 0.4;
      add(
        "Work authorization",
        matches ? "matched" : "mismatch",
        `The listing states “${authorization}”; confirm that it fits your work authorization.`,
        5,
      );
    }
  }

  if (input.minimumCompensation != null) {
    if (!input.minimumCompensationCurrency || !input.minimumCompensationPeriod) {
      add("Minimum compensation", "unknown", "Choose a currency and pay period to compare the amount safely.", 10);
    } else if (
      compensation.min == null ||
      compensation.currency !== input.minimumCompensationCurrency ||
      compensation.period !== input.minimumCompensationPeriod
    ) {
      add("Minimum compensation", "unknown", "The listing does not publish compensation in the same currency and pay period.", 10);
    } else {
      const matches = compensation.max != null && compensation.max >= input.minimumCompensation;
      add(
        "Minimum compensation",
        matches ? "matched" : "mismatch",
        `The listing publishes ${compensation.currency} ${compensation.min}–${compensation.max} per ${compensation.period}.`,
        10,
      );
    }
  }

  if (input.visaSponsorship && input.visaSponsorship !== "any") {
    if (visa === "not-specified" || visa === "confirm") {
      add("Visa sponsorship", "unknown", "Sponsorship is not confirmed by the listing.", 5);
    } else {
      const matches =
        (input.visaSponsorship === "offered" && visa === "offered") ||
        (input.visaSponsorship === "not-offered" && visa === "unavailable");
      add(
        "Visa sponsorship",
        matches ? "matched" : "mismatch",
        `The listing ${visa === "offered" ? "explicitly offers" : "explicitly does not offer"} sponsorship.`,
        5,
      );
    }
  }

  const score = possible ? Math.round((earned / possible) * 100) : 0;
  const matched = factors.filter((factor) => factor.status === "matched").length;
  const unknown = factors.filter((factor) => factor.status === "unknown").length;
  const explanation = `${matched} of ${factors.length} evaluated preferences match${unknown ? `; ${unknown} could not be confirmed` : ""}. A match score is not a qualification guarantee.`;
  return { score, breakdown: factors, explanation };
}

function makeListing(
  candidate: SearchCandidate,
  page: FetchPage | undefined,
  fetchError: string | null,
  input: CareerSearchInput,
): JobListing | null {
  const content = pageText(page);
  const pageTitle = stringValue(page?.title);
  const title = pageTitle && normalize(pageTitle).length > normalize(candidate.title).length
    ? pageTitle.slice(0, 180)
    : candidate.title;
  const fullText = `${page?.description ?? ""}\n${content}\n${candidate.snippet}`.slice(0, 10_000);
  const normalizedFull = normalize(`${title} ${fullText}`);
  if (!/\b(job|jobs|intern|internship|career|opening|role|position|apply|graduate|hiring)\b/.test(normalizedFull)) {
    return null;
  }

  const canonicalUrl = canonicalizeUrl(page?.final_url ? validPublicUrl(page.final_url) ?? candidate.url : candidate.url);
  const company = companyFromCandidate(candidate);
  const location = extractLocation(fullText, input.location);
  const arrangement = extractWorkArrangement(`${title} ${fullText}`);
  const employmentType = extractEmploymentType(`${title} ${fullText}`);
  const experienceLevel = extractExperience(`${title} ${fullText}`);
  const graduationYearRequirements = extractGraduationRequirement(fullText);
  const visaSponsorship = extractVisaStatus(fullText);
  const educationRequirements = extractEducation(fullText);
  const workAuthorization = extractAuthorization(fullText);
  const compensation = extractCompensation(fullText);
  const skills = extractSkills(fullText, input.skills ?? []);
  const deadline = extractDeadline(fullText);
  const isPastDeadline =
    deadline !== null &&
    !Number.isNaN(Date.parse(deadline)) &&
    Date.parse(deadline) < Date.now();
  const closedEvidence = explicitClosed(fullText);
  const status: JobListing["listingStatus"] = closedEvidence
    ? "closed"
    : isPastDeadline
      ? "possibly-expired"
      : fetchError && /\b(404|410|not found|removed)\b/i.test(fetchError)
        ? "possibly-expired"
        : page
          ? "verified"
          : "verification-needed";
  const verificationNote = closedEvidence
    ? `The live page says: “${closedEvidence}”.`
    : isPastDeadline
      ? `The listing states a deadline of ${deadline}, which has passed.`
      : status === "possibly-expired"
        ? "TinyFish reported that the source page may have been removed. Confirm before treating the role as closed."
        : page
          ? "The source page was fetched during this scan. This confirms the page is reachable, not that the employer is still accepting applications."
          : fetchError
            ? "The listing was found in search, but its page could not be checked. This may be temporary."
            : "The listing needs a live page check.";
  const match = scoreListing(
    title,
    fullText,
    location,
    arrangement,
    employmentType,
    experienceLevel,
    graduationYearRequirements,
    educationRequirements,
    workAuthorization,
    visaSponsorship,
    compensation,
    input,
  );
  const explicitApplyUrl = applyUrlFromContent(content, canonicalUrl);
  const applicationUrl =
    explicitApplyUrl ?? (page && explicitOpen(content) ? canonicalUrl : null);
  const host = new URL(canonicalUrl).hostname.toLowerCase();
  const id = createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 18);

  return {
    id,
    canonicalUrl,
    title,
    company,
    companyUrl: companyHomeUrl(candidate),
    applicationUrl,
    sourceName: candidate.siteName,
    sourceUrl: candidate.url,
    description: content
      ? content.replace(/\n{3,}/g, "\n\n").slice(0, 6500)
      : candidate.snippet || null,
    location,
    workArrangement: arrangement,
    employmentType,
    experienceLevel,
    requiredSkills: skills.required,
    preferredSkills: skills.preferred,
    educationRequirements,
    graduationYearRequirements,
    salaryMin: compensation.min,
    salaryMax: compensation.max,
    salaryCurrency: compensation.currency,
    payPeriod: compensation.period,
    postedAt: extractPostedAt(fullText),
    deadline,
    visaSponsorship,
    workAuthorization,
    lastCheckedAt: new Date().toISOString(),
    listingStatus: status,
    verificationConfidence: closedEvidence
      ? 0.98
      : isPastDeadline
        ? 0.95
        : status === "possibly-expired"
          ? 0.75
          : page
            ? 0.72
            : 0.35,
    verificationNote,
    matchScore: match.score,
    matchExplanation: match.explanation,
    matchBreakdown: match.breakdown,
    alternativeSources: [],
  };
}

function deduplicate(listings: JobListing[]): JobListing[] {
  const byUrl = new Map<string, JobListing>();
  const byIdentity = new Map<string, JobListing>();
  const sourceUrls = new Map<JobListing, Set<string>>();

  for (const listing of listings) {
    const urlKey = canonicalizeUrl(listing.canonicalUrl);
    const identityKey = [
      normalize(listing.company),
      normalize(listing.title),
      normalize(listing.location ?? ""),
    ].join("|");
    const existing = byUrl.get(urlKey) ?? byIdentity.get(identityKey);
    if (!existing) {
      byUrl.set(urlKey, listing);
      byIdentity.set(identityKey, listing);
      sourceUrls.set(listing, new Set([listing.sourceUrl]));
      continue;
    }

    const sources = sourceUrls.get(existing) ?? new Set([existing.sourceUrl]);
    sources.add(listing.sourceUrl);
    sourceUrls.set(existing, sources);
    const existingHasDetails = (existing.description?.length ?? 0) > 500;
    const nextHasDetails = (listing.description?.length ?? 0) > 500;
    const existingOfficial = !sourceIsAggregator(existing.sourceUrl);
    const nextOfficial = !sourceIsAggregator(listing.sourceUrl);
    if (
      (!existing.applicationUrl && listing.applicationUrl) ||
      (nextHasDetails && !existingHasDetails) ||
      (nextOfficial && !existingOfficial)
    ) {
      listing.alternativeSources = [...sources].filter((url) => url !== listing.sourceUrl);
      byUrl.set(urlKey, listing);
      byIdentity.set(identityKey, listing);
      sourceUrls.set(listing, sources);
    } else {
      existing.alternativeSources = [...sources].filter((url) => url !== existing.sourceUrl);
    }
  }
  return [...new Set(byIdentity.values())];
}

function stage(
  name: string,
  detail: string,
): { name: string; completed: boolean; detail: string } {
  return { name, completed: true, detail };
}

export async function searchLiveCareerListings(input: CareerSearchInput) {
  const queries = buildSearchQueries(input);
  const queryOutcomes = await Promise.allSettled(
    queries.map((query) => searchTinyFish(query, input)),
  );
  const successfulSearches = queryOutcomes.filter(
    (item): item is PromiseFulfilledResult<TinyFishSearchResult[]> =>
      item.status === "fulfilled",
  );
  const failedSearches = queryOutcomes.filter((item) => item.status === "rejected");

  if (successfulSearches.length === 0) {
    const failure = queryOutcomes.find((item) => item.status === "rejected");
    const reason =
      failure?.status === "rejected" ? failure.reason : undefined;
    if (reason instanceof TinyFishError) throw reason;
    throw new TinyFishError("TinyFish could not search the requested sources.");
  }

  const warnings: string[] = [];
  if (failedSearches.length) {
    warnings.push(
      `${failedSearches.length} of ${queries.length} search queries failed. Results from successful sources are preserved.`,
    );
  }
  const candidates = successfulSearches
    .flatMap((item) => item.value)
    .map(candidateFromResult)
    .filter((candidate): candidate is SearchCandidate => !!candidate)
    .filter((candidate) => candidateIsRelevant(candidate, input));
  const uniqueCandidates = [
    ...new Map(candidates.map((candidate) => [candidate.url, candidate])).values(),
  ].slice(0, 10);

  const fetchPayloadResult = await fetchTinyFishPages(
    uniqueCandidates.map((candidate) => candidate.url),
    "Extract the current job title, employer, responsibilities, qualifications, location, compensation, deadlines, work authorization, sponsorship, and application link from this real job page. Keep source wording and do not infer missing facts.",
    0,
  );
  const fetchedByUrl = mapByUrl(fetchPayloadResult);
  const listings = uniqueCandidates
    .map((candidate) => {
      const page =
        fetchedByUrl.get(canonicalizeUrl(candidate.url)) ??
        [...fetchedByUrl.values()].find(
          (item) => item.url === candidate.url || item.final_url === candidate.url,
        );
      const error = findFetchError(fetchPayloadResult, candidate.url);
      return makeListing(candidate, page, error, input);
    })
    .filter((listing): listing is JobListing => !!listing);
  const results = deduplicate(listings);
  const fetchErrors = fetchPayloadResult.errors?.length ?? 0;
  if (fetchErrors) {
    warnings.push(
      `${fetchErrors} listing page${fetchErrors === 1 ? "" : "s"} could not be read. Those listings remain marked for verification.`,
    );
  }
  if (uniqueCandidates.length === 0) {
    warnings.push(
      "TinyFish returned no job pages matching the requested role and sources. Try a broader role or location.",
    );
  }

  const searchResultTotal = successfulSearches.reduce(
    (count, item) => count + item.value.length,
    0,
  );
  const scannedAt = new Date().toISOString();
  return {
    query: input.query,
    results,
    sourcesQueried: queries.length,
    successfulSources: successfulSearches.length,
    failedSources: failedSearches.length,
    partialResults: failedSearches.length > 0 || fetchErrors > 0,
    warnings,
    scannedAt,
    stages: [
      stage(
        "searching",
        `TinyFish searched ${successfulSearches.length} of ${queries.length} career and job-board queries and returned ${searchResultTotal} pages.`,
      ),
      stage(
        "reading",
        `TinyFish fetched ${fetchPayloadResult.results?.length ?? 0} of ${uniqueCandidates.length} selected listing pages.`,
      ),
      stage(
        "checking-links",
        `${fetchPayloadResult.results?.length ?? 0} source pages were reachable during this scan; unavailable pages were left unverified.`,
      ),
      stage(
        "deduplicating",
        `Removed ${Math.max(0, listings.length - results.length)} duplicate listing${listings.length - results.length === 1 ? "" : "s"}.`,
      ),
      stage("matching", `Calculated evidence-based matches for ${results.length} listings.`),
    ],
  };
}

function agentResultText(body: unknown): string {
  if (!isRecord(body)) return "";
  const result = body.result;
  if (typeof result === "string") return result.slice(0, 4000);
  if (isRecord(result)) return JSON.stringify(result).slice(0, 4000);
  return "";
}

async function inspectWithAgent(
  url: string,
  input: ListingVerificationInput,
): Promise<string> {
  const body = await tinyFishRequest(AGENT_URL, {
    method: "POST",
    body: JSON.stringify({
      url,
      goal: `Inspect this job listing for "${input.title}" at "${input.company}". Navigate the page only as needed to determine whether this specific listing is still accepting applications. Report only direct page evidence. If it is explicitly open or closed, say so; otherwise say unknown. Include the final application URL and short verbatim evidence. Do not infer eligibility. Return a compact JSON object with listing_status (open, closed, unknown), application_url (string or null), and evidence (string).`,
    }),
  });
  return agentResultText(body);
}

export async function verifyLiveCareerListing(input: ListingVerificationInput) {
  const listingUrl = validPublicUrl(input.url);
  const applicationUrl = input.applicationUrl
    ? validPublicUrl(input.applicationUrl)
    : null;
  if (!listingUrl || (input.applicationUrl && !applicationUrl)) {
    throw new TinyFishError("Only public HTTP or HTTPS job URLs can be verified.", 400);
  }

  const urls = [...new Set([listingUrl, applicationUrl].filter((url): url is string => !!url))];
  const fetched = await fetchTinyFishPages(
    urls,
    "Verify this job posting and application page. Report page contents only; do not infer that an opportunity is open merely because the page is reachable.",
    0,
  );
  const pages = fetched.results ?? [];
  const combinedText = pages
    .map((page) => `${page.title ?? ""}\n${page.description ?? ""}\n${pageText(page)}`)
    .join("\n")
    .slice(0, 18_000);
  const fetchFailureText = (fetched.errors ?? [])
    .map((item) => item.error ?? "")
    .join(" ");
  const closed = explicitClosed(combinedText);
  const open = explicitOpen(combinedText);
  const applicationPageFound =
    !!applicationUrl &&
    pages.some((page) => {
      const resultUrl = page.url ? validPublicUrl(page.url) : null;
      const finalUrl = page.final_url ? validPublicUrl(page.final_url) : null;
      return (
        (!!resultUrl && canonicalizeUrl(resultUrl) === canonicalizeUrl(applicationUrl)) ||
        (!!finalUrl && canonicalizeUrl(finalUrl) === canonicalizeUrl(applicationUrl))
      );
    });

  let agentEvidence = "";
  let agentStatus: "open" | "closed" | "unknown" = "unknown";
  if (
    !closed &&
    !open &&
    combinedText.length < 450 &&
    !/\b(404|410)\b/i.test(fetchFailureText)
  ) {
    try {
      agentEvidence = await inspectWithAgent(applicationUrl ?? listingUrl, input);
      if (/\blisting_status["']?\s*:\s*["']closed["']/i.test(agentEvidence)) {
        agentStatus = "closed";
      } else if (/\blisting_status["']?\s*:\s*["']open["']/i.test(agentEvidence)) {
        agentStatus = "open";
      }
    } catch {
      agentEvidence = "TinyFish Agent could not confirm the page; manual confirmation is still needed.";
    }
  }

  const has404 = /\b(404|410|not found|removed)\b/i.test(fetchFailureText);
  const sourceAvailable = pages.some((page) => {
    const pageUrl = page.url ? validPublicUrl(page.url) : null;
    const finalUrl = page.final_url ? validPublicUrl(page.final_url) : null;
    return (
      (!!pageUrl && canonicalizeUrl(pageUrl) === canonicalizeUrl(listingUrl)) ||
      (!!finalUrl && canonicalizeUrl(finalUrl) === canonicalizeUrl(listingUrl))
    );
  });
  const conflict = Boolean(closed && (open || agentStatus === "open"));
  const listingStatus = conflict
    ? "conflicting"
    : closed || agentStatus === "closed"
      ? "closed"
      : has404
        ? "possibly-expired"
        : sourceAvailable || open || agentStatus === "open"
          ? "verified"
          : "verification-needed";
  const evidence = [
    closed,
    open,
    agentEvidence,
    fetchFailureText,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1200);
  const explanation =
    listingStatus === "conflicting"
      ? "The source pages disagree about whether applications are still open. Confirm with the employer before acting."
      : listingStatus === "closed"
        ? "The live page explicitly indicates that this role is closed or no longer accepting applications."
        : listingStatus === "possibly-expired"
          ? "The source returned a not-found or removed-page signal. This may indicate an expired listing; confirm with the employer."
          : listingStatus === "verified"
            ? "The source page was fetched successfully. Page availability does not guarantee the employer is still accepting applications."
            : "TinyFish could not find reliable evidence about this listing's current status. It has not been marked expired.";
  return {
    listingStatus,
    applicationUrlReachable: applicationUrl ? applicationPageFound : null,
    checkedAt: new Date().toISOString(),
    confidence:
      listingStatus === "closed" || listingStatus === "conflicting"
        ? 0.92
        : listingStatus === "possibly-expired"
          ? 0.72
          : listingStatus === "verified"
            ? 0.72
            : 0.35,
    explanation,
    evidence: evidence || "No reliable status evidence was returned by the source.",
  };
}
