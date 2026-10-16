import { Router, type IRouter } from "express";
import {
  GetCareerPilotStatusResponse,
  SearchCareerPilotJobsBody,
  SearchCareerPilotJobsResponse,
  VerifyCareerPilotListingBody,
  VerifyCareerPilotListingResponse,
} from "@workspace/api-zod";
import {
  fillLiveCareerApplication,
  searchLiveCareerListings,
  verifyLiveCareerListing,
  type ApplicationFormFillInput,
  type CareerSearchInput,
  type ListingVerificationInput,
} from "./careerpilot-service";

const router: IRouter = Router();
const rateWindows = new Map<string, { startedAt: number; count: number }>();

function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    if (rateWindows.size > 2000) {
      for (const [entryKey, window] of rateWindows) {
        if (now - window.startedAt >= windowMs) rateWindows.delete(entryKey);
      }
    }
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function profileText(value: Record<string, unknown>, key: string, max: number) {
  const item = value[key];
  if (item === undefined || item === null) return "";
  if (typeof item !== "string" || item.length > max) {
    throw new Error(`Invalid profile field: ${key}.`);
  }
  return item.trim();
}

function profileList(value: Record<string, unknown>, key: string, max: number) {
  const list = value[key];
  if (list === undefined || list === null) return [];
  if (
    !Array.isArray(list) ||
    list.length > max ||
    list.some((item) => typeof item !== "string" || item.length > 4000)
  ) {
    throw new Error(`Invalid profile field: ${key}.`);
  }
  return list.map((item) => (item as string).trim()).filter(Boolean);
}

function fillProfile(value: unknown): ApplicationFormFillInput["profile"] {
  if (!isRecord(value)) throw new Error("Master Profile is required.");
  const projectsValue = value.projects ?? [];
  const experienceValue = value.experience ?? [];
  if (
    !Array.isArray(projectsValue) ||
    projectsValue.length > 12 ||
    !Array.isArray(experienceValue) ||
    experienceValue.length > 12
  ) {
    throw new Error("Master Profile has too many project or experience entries.");
  }
  const readEntries = (
    entries: unknown[],
    fields: string[],
  ): Array<Record<string, string>> =>
    entries.map((entry) => {
      if (!isRecord(entry)) throw new Error("Invalid Master Profile entry.");
      return Object.fromEntries(
        fields.map((field) => [field, profileText(entry, field, 4000)]),
      );
    });
  return {
    fullName: profileText(value, "fullName", 300),
    email: profileText(value, "email", 320),
    phone: profileText(value, "phone", 80),
    location: profileText(value, "location", 300),
    headline: profileText(value, "headline", 500),
    summary: profileText(value, "summary", 5000),
    degree: profileText(value, "degree", 500),
    branch: profileText(value, "branch", 500),
    institution: profileText(value, "institution", 500),
    graduationYear: profileText(value, "graduationYear", 20),
    skills: profileList(value, "skills", 50),
    github: profileText(value, "github", 500),
    linkedin: profileText(value, "linkedin", 500),
    portfolio: profileText(value, "portfolio", 500),
    projects: readEntries(projectsValue, [
      "title",
      "description",
      "technologies",
      "contribution",
      "link",
    ]) as ApplicationFormFillInput["profile"]["projects"],
    experience: readEntries(experienceValue, [
      "role",
      "company",
      "dates",
      "description",
    ]) as ApplicationFormFillInput["profile"]["experience"],
  };
}

router.get("/careerpilot/status", (_req, res) => {
  const configured = Boolean(process.env.TINYFISH_API_KEY?.trim());
  res.json(
    GetCareerPilotStatusResponse.parse({
      provider: "tinyfish",
      configured,
      message: configured
        ? "Live search is ready."
        : "Add TINYFISH_API_KEY in Replit Secrets to enable live search.",
    }),
  );
});

router.post("/careerpilot/search", async (req, res) => {
  if (!process.env.TINYFISH_API_KEY?.trim()) {
    res.status(503).json({
      error: "TinyFish is not configured. Add TINYFISH_API_KEY in Replit Secrets.",
      code: "TINYFISH_NOT_CONFIGURED",
    });
    return;
  }

  const parsed = SearchCareerPilotJobsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Check the role, keywords, and preferences, then try again.",
      code: "INVALID_SEARCH",
    });
    return;
  }
  if (!allowRequest(`search:${req.ip}`, 12, 15 * 60 * 1000)) {
    res.status(429).json({
      error: "Too many live searches from this connection. Wait a few minutes, then retry.",
      code: "CAREERPILOT_RATE_LIMITED",
    });
    return;
  }

  try {
    const result = await searchLiveCareerListings(
      parsed.data as CareerSearchInput,
    );
    res.json(SearchCareerPilotJobsResponse.parse(result));
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: unknown }).status)
        : 502;
    const message =
      error instanceof Error
        ? error.message
        : "The live search could not be completed. Try again.";
    req.log.warn({ status, error }, "CareerPilot live search failed");
    res.status(status === 429 ? 429 : status === 400 ? 400 : 502).json({
      error: message,
      code: status === 429 ? "TINYFISH_RATE_LIMITED" : "TINYFISH_SEARCH_FAILED",
    });
  }
});

router.post("/careerpilot/verify", async (req, res) => {
  if (!process.env.TINYFISH_API_KEY?.trim()) {
    res.status(503).json({
      error: "TinyFish is not configured. Add TINYFISH_API_KEY in Replit Secrets.",
      code: "TINYFISH_NOT_CONFIGURED",
    });
    return;
  }

  const parsed = VerifyCareerPilotListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "The listing details are incomplete. Refresh the search and try again.",
      code: "INVALID_LISTING",
    });
    return;
  }
  if (!allowRequest(`verify:${req.ip}`, 8, 15 * 60 * 1000)) {
    res.status(429).json({
      error: "Too many verification requests from this connection. Wait a few minutes, then retry.",
      code: "CAREERPILOT_RATE_LIMITED",
    });
    return;
  }

  try {
    const result = await verifyLiveCareerListing(
      parsed.data as ListingVerificationInput,
    );
    res.json(VerifyCareerPilotListingResponse.parse(result));
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: unknown }).status)
        : 502;
    const message =
      error instanceof Error
        ? error.message
        : "The listing could not be verified right now.";
    req.log.warn({ status, error }, "CareerPilot listing verification failed");
    res.status(status === 400 ? 400 : 502).json({
      error: message,
      code: "TINYFISH_VERIFICATION_FAILED",
    });
  }
});

router.post("/careerpilot/application-assist", async (req, res) => {
  if (!process.env.TINYFISH_API_KEY?.trim()) {
    res.status(503).json({
      error: "TinyFish is not configured on this API server.",
      code: "TINYFISH_NOT_CONFIGURED",
    });
    return;
  }
  if (!isRecord(req.body) || req.body.confirmPersonalDataTransfer !== true) {
    res.status(400).json({
      error: "Confirm that the selected profile facts may be sent to TinyFish and the displayed employer URL.",
      code: "APPLICATION_ASSIST_CONSENT_REQUIRED",
    });
    return;
  }
  if (!allowRequest(`application-assist:${req.ip}`, 3, 30 * 60 * 1000)) {
    res.status(429).json({
      error: "Too many application-assistance runs. Wait before retrying.",
      code: "APPLICATION_ASSIST_RATE_LIMITED",
    });
    return;
  }

  let input: ApplicationFormFillInput;
  try {
    if (
      typeof req.body.url !== "string" ||
      typeof req.body.title !== "string" ||
      typeof req.body.company !== "string" ||
      req.body.title.length > 500 ||
      req.body.company.length > 500
    ) {
      throw new Error("Selected job details are incomplete.");
    }
    input = {
      url: req.body.url,
      title: req.body.title.trim(),
      company: req.body.company.trim(),
      profile: fillProfile(req.body.profile),
    };
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid application-assistance request.",
      code: "INVALID_APPLICATION_ASSIST_REQUEST",
    });
    return;
  }

  try {
    const result = await fillLiveCareerApplication(input);
    res.json(result);
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: unknown }).status)
        : 502;
    const message =
      error instanceof Error
        ? error.message
        : "TinyFish application assistance could not complete.";
    req.log.warn({ status, error }, "CareerPilot application assistance failed");
    res.status(status === 400 ? 400 : status === 429 ? 429 : 502).json({
      error: message,
      code:
        status === 429
          ? "TINYFISH_RATE_LIMITED"
          : "TINYFISH_APPLICATION_ASSIST_FAILED",
    });
  }
});

export default router;
