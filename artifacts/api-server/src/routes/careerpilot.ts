import { Router, type IRouter } from "express";
import {
  GetCareerPilotStatusResponse,
  SearchCareerPilotJobsBody,
  SearchCareerPilotJobsResponse,
  VerifyCareerPilotListingBody,
  VerifyCareerPilotListingResponse,
} from "@workspace/api-zod";
import {
  searchLiveCareerListings,
  verifyLiveCareerListing,
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

export default router;
