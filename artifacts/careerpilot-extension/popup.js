const careerPilotUrls = [
  "http://localhost:4173/*",
  "http://127.0.0.1:4173/*",
];

const pageInfo = document.getElementById("page-info");
const titleInput = document.getElementById("title");
const companyInput = document.getElementById("company");
const locationInput = document.getElementById("location");
const descriptionInput = document.getElementById("description");
const captureButton = document.getElementById("capture");
const profileStatus = document.getElementById("profile-status");
const resumeSelect = document.getElementById("resume-version");
const openResumeButton = document.getElementById("open-resume");
const consentInput = document.getElementById("consent");
const reviewButton = document.getElementById("review-fields");
const reviewPanel = document.getElementById("field-review");
const proposalsContainer = document.getElementById("field-proposals");
const fillButton = document.getElementById("fill");
const status = document.getElementById("status");

let activeTab = null;
let profile = null;
let activePageIsCareerPilot = false;
let proposals = [];

async function readProfile() {
  const tabs = await chrome.tabs.query({ url: careerPilotUrls });
  const profileTab = tabs.find((tab) => Number.isInteger(tab.id));
  if (!profileTab || profileTab.id === undefined) return null;
  const result = await chrome.scripting.executeScript({
    target: { tabId: profileTab.id },
    func: () => {
      try {
        const read = (key) => {
          const value = localStorage.getItem(key);
          return value ? JSON.parse(value) : null;
        };
        return {
          profile: read("careerpilot.masterProfile.v1"),
          resumes: read("careerpilot.resumeVersions.v1") || [],
          saved: read("careerpilot.saved.v1") || [],
          tracker: read("careerpilot.tracker.v1") || [],
          studioJob: read("careerpilot.studioJob.v1"),
        };
      } catch {
        return null;
      }
    },
  });
  const data = result[0]?.result;
  return data && typeof data === "object" ? data : null;
}

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab ?? null;
  const url = typeof tab?.url === "string" ? new URL(tab.url) : null;
  activePageIsCareerPilot = Boolean(
    url &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.port === "4173",
  );
  if (!url || url.protocol !== "https:") {
    pageInfo.textContent = "Open a public HTTPS job page to use the companion.";
  } else {
    pageInfo.textContent = url.hostname;
    captureButton.disabled = false;
    try {
      const [details] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          title: document.querySelector("main h1, article h1, h1")?.textContent?.trim().slice(0, 300) || "",
          description: document.querySelector('meta[name="description"], meta[property="og:description"]')?.getAttribute("content")?.trim().slice(0, 4000) || "",
        }),
      });
      titleInput.value = details?.result?.title || (tab?.title ?? "").slice(0, 300);
      descriptionInput.value = details?.result?.description || "";
    } catch (error) {
      titleInput.value = (tab?.title ?? "").slice(0, 300);
      status.textContent = `Could not inspect visible job details: ${error.message}`;
    }
  }

  try {
    const localData = await readProfile();
    profile = localData?.profile;
    const hasFacts =
      profile &&
      [profile.fullName, profile.email, profile.phone, profile.location]
        .some((value) => typeof value === "string" && value.trim());
    profileStatus.textContent = hasFacts
      ? "Master Profile found in CareerPilot on this device."
      : "No useful Master Profile found. Open CareerPilot, save your profile, and try again.";
    reviewButton.disabled = !hasFacts || !consentInput.checked || activePageIsCareerPilot || !url || url.protocol !== "https:";
    const knownJobs = [
      ...(Array.isArray(localData?.saved) ? localData.saved : []),
      ...(Array.isArray(localData?.tracker)
        ? localData.tracker.map((item) => item?.job).filter(Boolean)
        : []),
      ...(localData?.studioJob ? [localData.studioJob] : []),
    ];
    const knownJobIds = new Set(knownJobs.map((job) => job.id));
    const resumes = Array.isArray(localData?.resumes)
      ? localData.resumes.filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.jobId === "string" &&
            typeof item.content === "string" &&
            knownJobIds.has(item.jobId),
        )
      : [];
    for (const resume of resumes) {
      const option = document.createElement("option");
      option.value = resume.id;
      option.textContent = `${resume.jobTitle} · ${resume.company} · ${new Date(resume.createdAt).toLocaleDateString()}`;
      resumeSelect.append(option);
    }
    openResumeButton.disabled = resumes.length === 0;
    resumeSelect.disabled = resumes.length === 0;
  } catch (error) {
    profileStatus.textContent = `Could not read the local Master Profile: ${error.message}`;
  }
}

resumeSelect.addEventListener("change", () => {
  openResumeButton.disabled = !resumeSelect.value;
});

openResumeButton.addEventListener("click", async () => {
  if (!resumeSelect.value) return;
  const url = new URL("http://localhost:4173/career-studio");
  url.searchParams.set("resumeVersion", resumeSelect.value);
  await chrome.tabs.create({ url: url.toString() });
  status.textContent = "Opened the selected job-specific resume in CareerPilot.";
});

captureButton.addEventListener("click", async () => {
  if (!activeTab?.url || !titleInput.value.trim() || !companyInput.value.trim()) {
    status.textContent = "Enter a job title and company before capture.";
    return;
  }
  const capture = {
    url: activeTab.url,
    title: titleInput.value.trim(),
    company: companyInput.value.trim(),
    location: locationInput.value.trim(),
    description: descriptionInput.value.trim().slice(0, 4000),
  };
  const target = new URL("http://localhost:4173/career-studio");
  target.searchParams.set("capture", JSON.stringify(capture));
  await chrome.tabs.create({ url: target.toString() });
  status.textContent = "Job capture opened in CareerPilot.";
});

consentInput.addEventListener("change", () => {
  reviewButton.disabled =
    !consentInput.checked || !profile || !activeTab?.id || activePageIsCareerPilot;
  fillButton.disabled = !consentInput.checked || !proposals.some((item) => item.approved);
});

function inspectOrFillBlankFields(profileData, approvedFields) {
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const dangerous =
    /\b(work authorization|right to work|visa|sponsor|sponsorship|race|gender|disability|veteran|criminal|background check|eligible|eligibility|terms|agreement|consent|salary|compensation)\b/i;
  const allFields = [...document.querySelectorAll("input, textarea")].filter(
    (field) =>
      !field.disabled &&
      !field.readOnly &&
      (field instanceof HTMLTextAreaElement ||
        ["text", "email", "tel", "url"].includes(field.type)),
  );
  const fieldText = (field) => {
    const labels = [...document.querySelectorAll("label")]
      .filter(
        (label) =>
          label.htmlFor === field.id ||
          (field.id && label.contains(field)),
      )
      .map((label) => label.textContent || "");
    return normalize(
      [
        ...labels,
        field.getAttribute("aria-label"),
        field.getAttribute("placeholder"),
        field.getAttribute("autocomplete"),
        field.getAttribute("name"),
        field.id,
      ]
        .filter(Boolean)
        .join(" "),
    );
  };
  const nameParts = String(profileData.fullName || "")
    .trim()
    .split(/\s+/);
  const firstName = nameParts.shift() || "";
  const lastName = nameParts.join(" ");
  const mappings = [
    { pattern: /\b(email|e mail)\b/, value: profileData.email },
    { pattern: /\b(phone|telephone|mobile|tel)\b/, value: profileData.phone },
    { pattern: /\b(first name|given name|fname)\b/, value: firstName },
    { pattern: /\b(last name|family name|surname|lname)\b/, value: lastName },
    { pattern: /\b(full name|your name|candidate name)\b/, value: profileData.fullName },
    { pattern: /\b(city|location)\b/, value: profileData.location },
    { pattern: /\b(institution|university|college|school)\b/, value: profileData.institution },
    { pattern: /\b(degree|qualification)\b/, value: profileData.degree },
    { pattern: /\b(graduation year|year of graduation)\b/, value: profileData.graduationYear },
    { pattern: /\b(linkedin)\b/, value: profileData.linkedin },
    { pattern: /\b(github)\b/, value: profileData.github },
    { pattern: /\b(portfolio|personal website)\b/, value: profileData.portfolio },
    { pattern: /\b(professional headline|professional title)\b/, value: profileData.headline },
    { pattern: /\b(professional summary|profile summary)\b/, value: profileData.summary },
    { pattern: /\b(skills|technologies)\b/, value: (profileData.skills || []).join(", ") },
  ];
  const candidates = [];
  allFields.forEach((field, index) => {
    if (field.value?.trim()) return;
    const label = fieldText(field);
    if (dangerous.test(label)) return;
    const mapping = mappings.find((item) => item.pattern.test(label));
    if (!mapping || !mapping.value) return;
    candidates.push({ index, label, value: String(mapping.value).slice(0, 4000) });
  });
  if (!Array.isArray(approvedFields)) return { proposals: candidates };

  const filled = [];
  const skipped = [];
  for (const approved of approvedFields) {
    const candidate = candidates.find(
      (item) => item.index === approved.index && item.label === approved.label,
    );
    const field = Number.isInteger(approved.index) ? allFields[approved.index] : null;
    if (!candidate || !field || field.value?.trim() || dangerous.test(fieldText(field))) {
      skipped.push(approved.label || "A field changed after review");
      continue;
    }
    const setter =
      field instanceof HTMLTextAreaElement
        ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
        : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) {
      skipped.push(approved.label);
      continue;
    }
    setter.call(field, candidate.value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    filled.push(candidate.label.slice(0, 100) || "Unlabeled matching field");
  }
  return { filled, skipped, submitted: false };
}

function renderProposals(items) {
  proposals = items.map((item) => ({ ...item, approved: false }));
  proposalsContainer.replaceChildren();
  for (const [index, proposal] of proposals.entries()) {
    const label = document.createElement("label");
    label.className = "proposal";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = proposal.approved;
    checkbox.addEventListener("change", () => {
      proposals[index].approved = checkbox.checked;
      fillButton.disabled =
        !consentInput.checked || !proposals.some((item) => item.approved);
    });
    const details = document.createElement("span");
    const field = document.createElement("strong");
    field.textContent = proposal.label || "Matching form field";
    const value = document.createElement("span");
    value.textContent = proposal.value;
    details.append(field, value);
    label.append(checkbox, details);
    proposalsContainer.append(label);
  }
  reviewPanel.hidden = false;
  fillButton.disabled = !consentInput.checked || proposals.length === 0;
}

reviewButton.addEventListener("click", async () => {
  if (!consentInput.checked || !activeTab?.id || !profile) return;
  reviewButton.disabled = true;
  status.textContent = "Inspecting blank factual fields for your review…";
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: inspectOrFillBlankFields,
      args: [profile],
    });
    const items = result[0]?.result?.proposals;
    if (!Array.isArray(items)) throw new Error("The page did not return reviewable fields.");
    renderProposals(items);
    status.textContent = items.length
      ? "Review and select each suggested value before filling."
      : "No clearly matching blank fields were found.";
  } catch (error) {
    status.textContent = `Could not inspect form fields: ${error.message}`;
  } finally {
    reviewButton.disabled = !profile || activePageIsCareerPilot;
  }
});

fillButton.addEventListener("click", async () => {
  if (!consentInput.checked || !activeTab?.id || !profile) return;
  const approvedFields = proposals
    .filter((item) => item.approved)
    .map(({ index, label }) => ({ index, label }));
  if (!approvedFields.length) return;
  fillButton.disabled = true;
  status.textContent = "Applying reviewed values to the selected blank fields…";
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: inspectOrFillBlankFields,
      args: [profile, approvedFields],
    });
    const details = result[0]?.result;
    if (!details || details.submitted !== false) {
      throw new Error("The page did not confirm that it remained unsubmitted.");
    }
    status.textContent = `Filled ${details.filled.length} reviewed field(s); ${details.skipped.length} changed field(s) were skipped. Nothing was submitted.`;
    reviewPanel.hidden = true;
    proposals = [];
  } catch (error) {
    status.textContent = `Autofill failed: ${error.message}`;
  } finally {
    reviewButton.disabled = !profile || activePageIsCareerPilot;
    fillButton.disabled = true;
  }
});

void initialize().catch((error) => {
  status.textContent = `Could not initialize the companion: ${error.message}`;
});
