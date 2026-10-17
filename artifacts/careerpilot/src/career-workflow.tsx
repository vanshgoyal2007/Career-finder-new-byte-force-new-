import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Check,
  Clipboard,
  Download,
  FileText,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

export type ProfileProject = {
  title: string;
  description: string;
  technologies: string;
  contribution: string;
  link: string;
};

export type ProfileExperience = {
  role: string;
  company: string;
  dates: string;
  description: string;
};

export type MasterProfile = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  degree: string;
  branch: string;
  institution: string;
  graduationYear: string;
  skills: string[];
  projects: ProfileProject[];
  experience: ProfileExperience[];
  certifications: string[];
  workAuthorization: string;
  github: string;
  linkedin: string;
  portfolio: string;
};

export const emptyMasterProfile: MasterProfile = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  headline: "",
  summary: "",
  degree: "",
  branch: "",
  institution: "",
  graduationYear: "",
  skills: [],
  projects: [],
  experience: [],
  certifications: [],
  workAuthorization: "",
  github: "",
  linkedin: "",
  portfolio: "",
};

export type CareerStudioJob = {
  id: string;
  canonicalUrl: string;
  title: string;
  company: string;
  applicationUrl?: string | null;
  sourceName: string;
  description?: string | null;
  location?: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  educationRequirements?: string | null;
  graduationYearRequirements?: string | null;
  workAuthorization?: string | null;
  visaSponsorship: string;
};

export type ResumeVersion = {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  content: string;
  createdAt: string;
};

export type ApplicationEmailDraft = {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  subject: string;
  content: string;
  createdAt: string;
};

export type CoverLetterDraft = {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  content: string;
  createdAt: string;
};

export type OutreachDraft = {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactProfileUrl: string;
  content: string;
  status:
    | "draft"
    | "contact-verified"
    | "contacted"
    | "follow-up-due"
    | "replied"
    | "closed";
  audience?: "recruiter" | "hiring-manager" | "referral";
  followUpAt?: string | null;
  contactedAt?: string | null;
  createdAt: string;
};

type ProfilePageProps = {
  profile: MasterProfile;
  onSave: (profile: MasterProfile) => void;
};

type ParsedProfileSuggestions = Partial<
  Pick<
    MasterProfile,
    | "fullName"
    | "email"
    | "phone"
    | "summary"
    | "degree"
    | "institution"
    | "graduationYear"
    | "skills"
    | "certifications"
    | "github"
    | "linkedin"
    | "portfolio"
  >
>;

type CareerStudioProps = {
  profile: MasterProfile;
  jobs: CareerStudioJob[];
  selectedJob: CareerStudioJob | null;
  resumeToLoadId: string | null;
  onSelectJob: (job: CareerStudioJob | null) => void;
  resumes: ResumeVersion[];
  emailDrafts: ApplicationEmailDraft[];
  coverLetters: CoverLetterDraft[];
  outreachDrafts: OutreachDraft[];
  onSaveResume: (resume: ResumeVersion) => void;
  onSaveEmail: (draft: ApplicationEmailDraft) => void;
  onSaveCoverLetter: (draft: CoverLetterDraft) => void;
  onSaveOutreach: (draft: OutreachDraft) => void;
  onLinkToTracker: (
    job: CareerStudioJob,
    resumeId: string,
    emailId: string,
    analysis: string,
    coverLetterId?: string,
  ) => void;
  onLinkOutreach: (
    job: CareerStudioJob,
    draftId: string,
    draft?: OutreachDraft,
  ) => void;
  aiConfigured: boolean;
  aiStatusMessage: string;
  gmailConfigured: boolean;
  gmailConnected: boolean;
  gmailStatusMessage: string;
  tinyFishConfigured: boolean;
  onGenerateMaterial: (
    kind: "resume" | "application-email" | "outreach",
    job: CareerStudioJob,
    profile: MasterProfile,
  ) => Promise<string>;
  onConnectGmail: () => Promise<void>;
  onSendEmail: (to: string, subject: string, text: string) => Promise<string>;
  onAssistApplication: (
    job: CareerStudioJob,
    profile: MasterProfile,
  ) => Promise<{
    fieldsFilled: string[];
    fieldsSkipped: string[];
    submissionStatus: "not_submitted";
  }>;
};

const newId = () => globalThis.crypto.randomUUID();
const splitList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function prettyProfileLabel(value: string) {
  return value.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) =>
    letter.toUpperCase(),
  );
}

const resumeSectionHeadings =
  /^(summary|professional summary|profile|objective|skills|technical skills|core competencies|education|academic background|experience|work experience|professional experience|projects|certifications|certifications & accomplishments)\s*:?\s*$/i;

function resumeSection(text: string, heading: RegExp) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => heading.test(line.trim()));
  if (start < 0) return "";
  const content: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (resumeSectionHeadings.test(line.trim())) break;
    if (line.trim()) content.push(line.trim());
  }
  return content.join("\n").trim();
}

function parseResumeProfile(text: string): ParsedProfileSuggestions {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const fullText = lines.join("\n");
  const education = resumeSection(fullText, /^education(?:al background)?\s*:?\s*$/i);
  const skillsSection = resumeSection(
    fullText,
    /^(?:(?:technical )?skills|core competencies)\s*:?\s*$/i,
  );
  const certificationSection = resumeSection(
    fullText,
    /^certifications(?: & accomplishments)?\s*:?\s*$/i,
  );
  const summary = resumeSection(
    fullText,
    /^(?:professional )?(?:summary|profile|objective)\s*:?\s*$/i,
  );
  const degree = education
    .split("\n")
    .find((line) =>
      /\b(bachelor|master|doctor|associate|ph\.?d|b\.?s\.?|b\.?a\.?|b\.?e\.?|b\.?tech|m\.?s\.?|m\.?a\.?|m\.?e\.?|m\.?tech|m\.?b\.?a)\b/i.test(
        line,
      ),
    );
  const institution = education
    .split("\n")
    .find(
      (line) =>
        /\b(university|college|institute|school)\b/i.test(line) &&
        !/\b(bachelor|master|degree|diploma)\b/i.test(line),
    );
  const years = education.match(/\b(?:19|20)\d{2}\b/g);
  const firstLine = lines.find(
    (line) =>
      line.length <= 100 &&
      !/@|https?:\/\/|resume|curriculum vitae/i.test(line) &&
      !resumeSectionHeadings.test(line),
  );
  const email = fullText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  const phone = fullText.match(
    /(?:\+?\d[\d\s().-]{7,}\d)/,
  )?.[0];
  const urls = fullText.match(
    /https?:\/\/[^\s|,]+|(?:www\.)?[\w-]+\.(?:com|org|net|io|dev|edu|co)(?:\/[^\s|,]*)?/gi,
  ) ?? [];
  const link = (host: string) =>
    urls.find((url) => url.toLowerCase().includes(host))?.replace(/[).,;]+$/, "");
  const normalizeLink = (value?: string) =>
    value ? (value.startsWith("http") ? value : `https://${value}`) : undefined;
  const skills = skillsSection
    .split(/[,;|•·\n]/)
    .map((skill) => skill.replace(/^[-*]\s*/, "").trim())
    .filter((skill) => skill && skill.length <= 80)
    .slice(0, 60);
  const certifications = certificationSection
    .split(/\n|;|•/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 30);

  return {
    ...(firstLine ? { fullName: firstLine } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(summary ? { summary } : {}),
    ...(degree ? { degree: degree.replace(/\s*[|·,].*$/, "") } : {}),
    ...(institution ? { institution } : {}),
    ...(years?.length ? { graduationYear: years.at(-1) } : {}),
    ...(skills.length ? { skills } : {}),
    ...(certifications.length ? { certifications } : {}),
    ...(normalizeLink(link("linkedin")) ? { linkedin: normalizeLink(link("linkedin")) } : {}),
    ...(normalizeLink(link("github")) ? { github: normalizeLink(link("github")) } : {}),
    ...(normalizeLink(urls.find((url) => !/linkedin|github/i.test(url))) ? { portfolio: normalizeLink(urls.find((url) => !/linkedin|github/i.test(url))) } : {}),
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="career-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ProfileList({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  return (
    <Field label={label}>
      <textarea
        value={values.join(", ")}
        onChange={(event) => onChange(splitList(event.target.value))}
        placeholder={placeholder}
        rows={3}
      />
      <small>
        Separate items with commas. Only include information you can verify.
      </small>
    </Field>
  );
}

export function MasterProfilePage({ profile, onSave }: ProfilePageProps) {
  const [draft, setDraft] = useState(profile);
  const [message, setMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importText, setImportText] = useState("");
  const [importSuggestions, setImportSuggestions] =
    useState<ParsedProfileSuggestions | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const update = <K extends keyof MasterProfile>(
    key: K,
    value: MasterProfile[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => setDraft(profile), [profile]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft);
    setMessage("Master Profile saved in this browser.");
  };

  const importResumePdf = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setImportMessage("Choose a PDF file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImportMessage("PDFs must be 10 MB or smaller.");
      return;
    }
    setImportBusy(true);
    setImportMessage("Reading the PDF locally in this browser…");
    setImportSuggestions(null);
    setImportText("");
    let document: import("pdfjs-dist").PDFDocumentProxy | undefined;
    try {
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const data = new Uint8Array(await file.arrayBuffer());
      if (String.fromCharCode(...data.slice(0, 5)) !== "%PDF-") {
        throw new Error("This file does not appear to be a valid PDF.");
      }
      document = await pdfjs.getDocument({ data }).promise;
      const pageCount = Math.min(document.numPages, 20);
      const extracted: string[] = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) =>
            "str" in item && typeof item.str === "string"
              ? `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}`
              : "",
          )
          .join("")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/[ \t]{2,}/g, " ")
          .trim();
        if (pageText) extracted.push(pageText);
      }
      const text = extracted.join("\n\n").slice(0, 60_000);
      if (!text) {
        throw new Error(
          "No selectable text was found. This may be a scanned PDF; enter those details manually.",
        );
      }
      const suggestions = parseResumeProfile(text);
      setImportText(text);
      setImportSuggestions(suggestions);
      const fieldCount = Object.values(suggestions).filter(
        (value) => Array.isArray(value) ? value.length > 0 : Boolean(value),
      ).length;
      setImportMessage(
        `${fieldCount} editable profile suggestion(s) found from ${pageCount} page(s). Review them before applying.`,
      );
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : "Could not parse this PDF.",
      );
    } finally {
      await document?.destroy();
      setImportBusy(false);
    }
  };

  const applyImportSuggestions = () => {
    if (!importSuggestions) return;
    setDraft((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(importSuggestions)) {
        if (Array.isArray(value)) {
          const listKey = key as "skills" | "certifications";
          if (next[listKey].length === 0) next[listKey] = value;
        } else if (
          typeof value === "string" &&
          !next[key as keyof MasterProfile]
        ) {
          Object.assign(next, { [key]: value });
        }
      }
      return next;
    });
    setMessage(
      "PDF suggestions copied into empty fields. Review and save the profile.",
    );
  };

  const updateProject = (index: number, patch: Partial<ProfileProject>) =>
    update(
      "projects",
      draft.projects.map((project, row) =>
        row === index ? { ...project, ...patch } : project,
      ),
    );
  const updateExperience = (index: number, patch: Partial<ProfileExperience>) =>
    update(
      "experience",
      draft.experience.map((item, row) =>
        row === index ? { ...item, ...patch } : item,
      ),
    );

  return (
    <>
      <header className="cp-page-head">
        <div>
          <div className="cp-eyebrow">Your candidate record</div>
          <h1 className="cp-h1">Master Profile</h1>
          <p className="cp-subtitle">
            Maintain one factual profile for job matching and application
            materials. It stays in this browser and is not uploaded to
            Vayora.
          </p>
        </div>
      </header>
      <form className="career-profile-form" onSubmit={submit}>
        <section className="cp-card career-panel">
          <h2>Import an existing resume PDF</h2>
          <p className="career-empty-note">
            The PDF is read locally in this browser (up to 10 MB and 20 pages).
            Extracted suggestions are editable and are not saved or sent
            anywhere until you review the profile and save it. Scanned-image
            PDFs need OCR and can be entered manually.
          </p>
          <Field label="Choose a PDF resume">
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => void importResumePdf(event)}
              disabled={importBusy}
            />
          </Field>
          <div className="career-save-row">
            <span role="status">{importMessage}</span>
            <button
              className="cp-button secondary"
              type="button"
              disabled={!importSuggestions || importBusy}
              onClick={applyImportSuggestions}
            >
              <Upload size={14} />
              Apply suggestions to empty fields
            </button>
          </div>
          {importSuggestions && (
            <details className="career-job-description">
              <summary>
                Review extracted suggestions and text before applying
              </summary>
              <ul>
                {Object.entries(importSuggestions).map(([key, value]) => (
                  <li key={key}>
                    <strong>{prettyProfileLabel(key)}:</strong>{" "}
                    {Array.isArray(value) ? value.join(", ") : value}
                  </li>
                ))}
              </ul>
              <textarea
                rows={8}
                aria-label="Extracted resume text"
                value={importText}
                onChange={(event) => {
                  const text = event.target.value;
                  setImportText(text);
                  setImportSuggestions(parseResumeProfile(text));
                  setImportMessage(
                    "Edited extracted text. Review updated suggestions before applying.",
                  );
                }}
              />
            </details>
          )}
        </section>
        <section className="cp-card career-panel">
          <h2>Contact and professional summary</h2>
          <div className="career-grid">
            <Field label="Full name">
              <input
                value={draft.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={draft.email}
                onChange={(e) => update("email", e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={draft.phone}
                onChange={(e) => update("phone", e.target.value)}
                autoComplete="tel"
              />
            </Field>
            <Field label="Location">
              <input
                value={draft.location}
                onChange={(e) => update("location", e.target.value)}
                autoComplete="address-level2"
              />
            </Field>
            <Field label="Professional headline">
              <input
                value={draft.headline}
                onChange={(e) => update("headline", e.target.value)}
                placeholder="Use a truthful current description"
              />
            </Field>
            <Field label="Work authorization (optional)">
              <input
                value={draft.workAuthorization}
                onChange={(e) => update("workAuthorization", e.target.value)}
                placeholder="Only state what applies to you"
              />
            </Field>
          </div>
          <Field label="Professional summary">
            <textarea
              rows={4}
              value={draft.summary}
              onChange={(e) => update("summary", e.target.value)}
            />
          </Field>
        </section>

        <section className="cp-card career-panel">
          <h2>Education and skills</h2>
          <div className="career-grid">
            <Field label="Degree">
              <input
                value={draft.degree}
                onChange={(e) => update("degree", e.target.value)}
              />
            </Field>
            <Field label="Branch or specialization">
              <input
                value={draft.branch}
                onChange={(e) => update("branch", e.target.value)}
              />
            </Field>
            <Field label="Institution">
              <input
                value={draft.institution}
                onChange={(e) => update("institution", e.target.value)}
              />
            </Field>
            <Field label="Graduation year">
              <input
                type="number"
                min="1900"
                max="2100"
                value={draft.graduationYear}
                onChange={(e) => update("graduationYear", e.target.value)}
              />
            </Field>
          </div>
          <ProfileList
            label="Skills"
            values={draft.skills}
            onChange={(value) => update("skills", value)}
            placeholder="Only skills you have actually used"
          />
          <ProfileList
            label="Certifications and accomplishments"
            values={draft.certifications}
            onChange={(value) => update("certifications", value)}
            placeholder="Exact credential or accomplishment"
          />
        </section>

        <section className="cp-card career-panel">
          <div className="career-panel-heading">
            <div>
              <h2>Projects</h2>
              <p>Add your real contributions, tools, and public links.</p>
            </div>
            <button
              type="button"
              className="cp-button secondary"
              onClick={() =>
                update("projects", [
                  ...draft.projects,
                  {
                    title: "",
                    description: "",
                    technologies: "",
                    contribution: "",
                    link: "",
                  },
                ])
              }
            >
              <Plus size={14} />
              Add project
            </button>
          </div>
          {!draft.projects.length && (
            <p className="career-empty-note">
              No projects added yet. Nothing will be claimed on your resume
              unless you add it here.
            </p>
          )}
          {draft.projects.map((project, index) => (
            <div className="career-repeat-card" key={index}>
              <div className="career-panel-heading">
                <strong>Project {index + 1}</strong>
                <button
                  type="button"
                  className="cp-icon-btn"
                  aria-label={`Remove project ${index + 1}`}
                  onClick={() =>
                    update(
                      "projects",
                      draft.projects.filter((_, row) => row !== index),
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="career-grid">
                <Field label="Project name">
                  <input
                    value={project.title}
                    onChange={(e) =>
                      updateProject(index, { title: e.target.value })
                    }
                  />
                </Field>
                <Field label="Technologies">
                  <input
                    value={project.technologies}
                    onChange={(e) =>
                      updateProject(index, { technologies: e.target.value })
                    }
                    placeholder="Technologies you used"
                  />
                </Field>
                <Field label="Project link">
                  <input
                    type="url"
                    value={project.link}
                    onChange={(e) =>
                      updateProject(index, { link: e.target.value })
                    }
                    placeholder="https://"
                  />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  rows={3}
                  value={project.description}
                  onChange={(e) =>
                    updateProject(index, { description: e.target.value })
                  }
                />
              </Field>
              <Field label="Your contribution">
                <textarea
                  rows={3}
                  value={project.contribution}
                  onChange={(e) =>
                    updateProject(index, { contribution: e.target.value })
                  }
                />
              </Field>
            </div>
          ))}
        </section>

        <section className="cp-card career-panel">
          <div className="career-panel-heading">
            <div>
              <h2>Experience</h2>
              <p>
                Work, internships, volunteering, or other relevant experience.
              </p>
            </div>
            <button
              type="button"
              className="cp-button secondary"
              onClick={() =>
                update("experience", [
                  ...draft.experience,
                  { role: "", company: "", dates: "", description: "" },
                ])
              }
            >
              <Plus size={14} />
              Add experience
            </button>
          </div>
          {!draft.experience.length && (
            <p className="career-empty-note">No experience added yet.</p>
          )}
          {draft.experience.map((item, index) => (
            <div className="career-repeat-card" key={index}>
              <div className="career-panel-heading">
                <strong>Experience {index + 1}</strong>
                <button
                  type="button"
                  className="cp-icon-btn"
                  aria-label={`Remove experience ${index + 1}`}
                  onClick={() =>
                    update(
                      "experience",
                      draft.experience.filter((_, row) => row !== index),
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="career-grid">
                <Field label="Role">
                  <input
                    value={item.role}
                    onChange={(e) =>
                      updateExperience(index, { role: e.target.value })
                    }
                  />
                </Field>
                <Field label="Organization">
                  <input
                    value={item.company}
                    onChange={(e) =>
                      updateExperience(index, { company: e.target.value })
                    }
                  />
                </Field>
                <Field label="Dates">
                  <input
                    value={item.dates}
                    onChange={(e) =>
                      updateExperience(index, { dates: e.target.value })
                    }
                    placeholder="Use your actual dates"
                  />
                </Field>
              </div>
              <Field label="Responsibilities and achievements">
                <textarea
                  rows={3}
                  value={item.description}
                  onChange={(e) =>
                    updateExperience(index, { description: e.target.value })
                  }
                />
              </Field>
            </div>
          ))}
        </section>

        <section className="cp-card career-panel">
          <h2>Professional links</h2>
          <div className="career-grid">
            <Field label="GitHub">
              <input
                type="url"
                value={draft.github}
                onChange={(e) => update("github", e.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field label="LinkedIn">
              <input
                type="url"
                value={draft.linkedin}
                onChange={(e) => update("linkedin", e.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field label="Portfolio">
              <input
                type="url"
                value={draft.portfolio}
                onChange={(e) => update("portfolio", e.target.value)}
                placeholder="https://"
              />
            </Field>
          </div>
        </section>
        <div className="career-save-row">
          {message && <span role="status">{message}</span>}
          <button className="cp-button" type="submit">
            <Check size={14} />
            Save Master Profile
          </button>
        </div>
      </form>
    </>
  );
}

function makeResume(profile: MasterProfile, job: CareerStudioJob) {
  const sections: string[] = [];
  const heading = [profile.fullName, profile.headline]
    .filter(Boolean)
    .join(" | ");
  if (heading) sections.push(heading);
  const contact = [
    profile.email,
    profile.phone,
    profile.location,
    profile.github,
    profile.linkedin,
    profile.portfolio,
  ].filter(Boolean);
  if (contact.length) sections.push(contact.join(" | "));
  if (profile.summary.trim())
    sections.push(`SUMMARY\n${profile.summary.trim()}`);

  const skills = profile.skills.filter(Boolean);
  if (skills.length) sections.push(`SKILLS\n${skills.join(" · ")}`);

  const required = [...job.requiredSkills, ...job.preferredSkills].map(
    (skill) => skill.toLowerCase(),
  );
  const projects = [...profile.projects].sort((a, b) => {
    const relevance = (project: ProfileProject) =>
      required.filter((skill) =>
        `${project.technologies} ${project.description} ${project.contribution}`
          .toLowerCase()
          .includes(skill),
      ).length;
    return relevance(b) - relevance(a);
  });
  const populatedProjects = projects.filter(
    (project) => project.title || project.description || project.contribution,
  );
  if (populatedProjects.length) {
    sections.push(
      `PROJECTS\n${populatedProjects
        .map((project) =>
          [
            project.title,
            project.technologies && `Technologies: ${project.technologies}`,
            project.description,
            project.contribution,
            project.link,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n")}`,
    );
  }

  const experience = profile.experience.filter(
    (item) => item.role || item.company || item.description,
  );
  if (experience.length) {
    sections.push(
      `EXPERIENCE\n${experience
        .map((item) =>
          [
            [item.role, item.company, item.dates].filter(Boolean).join(" | "),
            item.description,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n")}`,
    );
  }

  const education = [
    [profile.degree, profile.branch].filter(Boolean).join(" · "),
    profile.institution,
    profile.graduationYear && `Graduation year: ${profile.graduationYear}`,
  ].filter(Boolean);
  if (education.length) sections.push(`EDUCATION\n${education.join("\n")}`);
  if (profile.certifications.length)
    sections.push(
      `CERTIFICATIONS & ACCOMPLISHMENTS\n${profile.certifications.join("\n")}`,
    );
  return sections.join("\n\n");
}

function makeEmail(profile: MasterProfile, job: CareerStudioJob) {
  const relevant = profile.projects.find((project) => {
    const terms = [...job.requiredSkills, ...job.preferredSkills].map((skill) =>
      skill.toLowerCase(),
    );
    return terms.some((skill) =>
      `${project.technologies} ${project.description} ${project.contribution}`
        .toLowerCase()
        .includes(skill),
    );
  });
  const evidence = relevant?.title
    ? `My project${relevant.technologies ? ` using ${relevant.technologies}` : ""}, ${relevant.title}${relevant.contribution ? `, involved ${relevant.contribution}` : ""}.`
    : profile.summary
      ? profile.summary
      : profile.skills.length
        ? `My profile lists experience with ${profile.skills.join(", ")}.`
        : "[Add a true, specific example of your relevant experience.]";
  return `Subject: Application for ${job.title}\n\nHello ${job.company} Hiring Team,\n\nI am applying for the ${job.title} role${job.location ? ` in ${job.location}` : ""}. ${evidence}\n\nI would welcome the opportunity to discuss how my experience relates to the role.\n\nThank you for your consideration,\n${profile.fullName || "[Your name]"}${profile.email ? `\n${profile.email}` : ""}${profile.phone ? `\n${profile.phone}` : ""}`;
}

function makeCoverLetter(profile: MasterProfile, job: CareerStudioJob) {
  const relevantProject = profile.projects.find((project) =>
    [...job.requiredSkills, ...job.preferredSkills].some((skill) =>
      `${project.technologies} ${project.description} ${project.contribution}`
        .toLowerCase()
        .includes(skill.toLowerCase()),
    ),
  );
  const evidence = relevantProject
    ? `${relevantProject.title}${relevantProject.technologies ? `, using ${relevantProject.technologies}` : ""}${relevantProject.contribution ? `: ${relevantProject.contribution}` : ""}.`
    : profile.summary ||
      (profile.skills.length
        ? `My saved profile lists ${profile.skills.join(", ")}.`
        : "[Add a specific, truthful example relevant to this position.]");
  return `${profile.fullName || "[Your name]"}\n${[profile.email, profile.phone, profile.location].filter(Boolean).join(" · ")}\n\n${new Date().toLocaleDateString()}\n\n${job.company}\n\nDear ${job.company} Hiring Team,\n\nI am writing to express my interest in the ${job.title} position${job.location ? ` in ${job.location}` : ""}. ${evidence}\n\nI would welcome the opportunity to discuss how my verified experience relates to the needs described for this role. Thank you for your time and consideration.\n\nSincerely,\n${profile.fullName || "[Your name]"}`;
}

function makeOutreach(
  profile: MasterProfile,
  job: CareerStudioJob,
  contactName: string,
  contactRole: string,
  audience: NonNullable<OutreachDraft["audience"]> = "recruiter",
) {
  const project = profile.projects.find((item) => {
    const skills = [...job.requiredSkills, ...job.preferredSkills].map(
      (skill) => skill.toLowerCase(),
    );
    return skills.some((skill) =>
      `${item.technologies} ${item.description} ${item.contribution}`
        .toLowerCase()
        .includes(skill),
    );
  });
  const evidence = project?.title
    ? `I recently worked on ${project.title}${project.technologies ? ` using ${project.technologies}` : ""}${project.contribution ? `, where I ${project.contribution}` : ""}.`
    : profile.summary
      ? profile.summary
      : profile.skills.length
        ? `My profile includes ${profile.skills.join(", ")}.`
        : "[Add one specific, truthful example from your experience.]";
  const greeting = contactName
    ? `Hello ${contactName}`
    : `Hello ${contactRole || `${job.company} team`}`;
  const opening =
    audience === "hiring-manager"
      ? `I am interested in the ${job.title} role at ${job.company}${job.location ? ` in ${job.location}` : ""}.`
      : audience === "referral"
        ? `I came across the ${job.title} opportunity at ${job.company}${job.location ? ` in ${job.location}` : ""} and am learning more about the team.`
        : `I am exploring the ${job.title} opportunity at ${job.company}${job.location ? ` in ${job.location}` : ""}.`;
  const request =
    audience === "hiring-manager"
      ? "If you are the right person to ask, I would appreciate learning about the team’s priorities for this role."
      : audience === "referral"
        ? "If you feel comfortable, I would appreciate any advice about the role or the application process. I understand if you are unable to refer me."
        : "If appropriate, I would appreciate any guidance on the role or the recruiting process.";
  return `${greeting},\n\n${opening} ${evidence}\n\n${request} Thank you for your time.\n\n${profile.fullName || "[Your name]"}${profile.email ? `\n${profile.email}` : ""}`;
}

function analyzeJob(profile: MasterProfile, job: CareerStudioJob) {
  const profileSkills = profile.skills.map((skill) => skill.toLowerCase());
  const projectEvidence = profile.projects.flatMap((project) =>
    splitList(project.technologies).map((technology) => ({
      technology: technology.toLowerCase(),
      title: project.title,
    })),
  );
  const listingText = `${job.title} ${job.description ?? ""}`.toLowerCase();
  const requirements = [
    ...new Set([
      ...job.requiredSkills,
      ...job.preferredSkills,
      ...profile.skills.filter((skill) =>
        listingText.includes(skill.toLowerCase()),
      ),
    ]),
  ];
  const skills = requirements.map((skill) => {
    const direct = profileSkills.find((item) => item === skill.toLowerCase());
    const project = projectEvidence.find(
      (item) => item.technology === skill.toLowerCase(),
    );
    return {
      skill,
      evidence: direct
        ? "Listed in profile skills"
        : project
          ? `Project: ${project.title || "Untitled project"}`
          : null,
    };
  });
  const evidence = [
    profile.summary,
    ...profile.experience.map((item) => item.description),
    ...profile.projects.flatMap((project) => [
      project.description,
      project.contribution,
    ]),
  ]
    .filter(Boolean)
    .join("\n");
  return {
    skills,
    relevantProjects: profile.projects.filter((project) => {
      const terms = requirements.map((item) => item.toLowerCase());
      return terms.some((term) =>
        `${project.technologies} ${project.description} ${project.contribution}`
          .toLowerCase()
          .includes(term),
      );
    }),
    hasSummaryEvidence: Boolean(evidence.trim()),
  };
}

export function CareerStudioPage({
  profile,
  jobs,
  selectedJob,
  resumeToLoadId,
  onSelectJob,
  resumes,
  emailDrafts,
  coverLetters,
  outreachDrafts,
  onSaveResume,
  onSaveEmail,
  onSaveCoverLetter,
  onSaveOutreach,
  onLinkToTracker,
  onLinkOutreach,
  aiConfigured,
  aiStatusMessage,
  gmailConfigured,
  gmailConnected,
  gmailStatusMessage,
  tinyFishConfigured,
  onGenerateMaterial,
  onConnectGmail,
  onSendEmail,
  onAssistApplication,
}: CareerStudioProps) {
  const [resumeText, setResumeText] = useState("");
  const [emailText, setEmailText] = useState("");
  const [coverLetterText, setCoverLetterText] = useState("");
  const [resumeMessage, setResumeMessage] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [coverLetterMessage, setCoverLetterMessage] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [applicationRecipient, setApplicationRecipient] = useState("");
  const [gmailBusy, setGmailBusy] = useState(false);
  const [fillConfirmed, setFillConfirmed] = useState(false);
  const [fillBusy, setFillBusy] = useState(false);
  const [fillMessage, setFillMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [selectedEmailId, setSelectedEmailId] = useState("");
  const [selectedCoverLetterId, setSelectedCoverLetterId] = useState("");
  const [selectedOutreachId, setSelectedOutreachId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactProfileUrl, setContactProfileUrl] = useState("");
  const [contactVerified, setContactVerified] = useState(false);
  const [outreachAudience, setOutreachAudience] =
    useState<NonNullable<OutreachDraft["audience"]>>("recruiter");
  const [followUpAt, setFollowUpAt] = useState("");
  const [outreachStatus, setOutreachStatus] =
    useState<OutreachDraft["status"]>("draft");
  const [outreachText, setOutreachText] = useState("");
  const [outreachMessage, setOutreachMessage] = useState("");
  const generatedResume = useMemo(
    () => (selectedJob ? makeResume(profile, selectedJob) : ""),
    [profile, selectedJob],
  );
  const generatedEmail = useMemo(
    () => (selectedJob ? makeEmail(profile, selectedJob) : ""),
    [profile, selectedJob],
  );
  const generatedCoverLetter = useMemo(
    () => (selectedJob ? makeCoverLetter(profile, selectedJob) : ""),
    [profile, selectedJob],
  );
  const analysis = useMemo(
    () => (selectedJob ? analyzeJob(profile, selectedJob) : null),
    [profile, selectedJob],
  );
  const jobResumes = selectedJob
    ? resumes.filter((version) => version.jobId === selectedJob.id)
    : [];
  const jobEmails = selectedJob
    ? emailDrafts.filter((draft) => draft.jobId === selectedJob.id)
    : [];
  const jobCoverLetters = selectedJob
    ? coverLetters.filter((draft) => draft.jobId === selectedJob.id)
    : [];
  const jobOutreach = selectedJob
    ? outreachDrafts.filter((draft) => draft.jobId === selectedJob.id)
    : [];
  const applicationTarget = selectedJob
    ? selectedJob.applicationUrl || selectedJob.canonicalUrl
    : "";
  let applicationHost = "No application URL";
  try {
    if (applicationTarget) applicationHost = new URL(applicationTarget).host;
  } catch {
    applicationHost = "Invalid application URL";
  }

  useEffect(() => {
    const requestedResume = resumes.find(
      (version) =>
        version.id === resumeToLoadId && version.jobId === selectedJob?.id,
    );
    setResumeText(requestedResume?.content ?? generatedResume);
    setEmailText(generatedEmail);
    const priorCoverLetter = selectedJob
      ? coverLetters.find((draft) => draft.jobId === selectedJob.id)
      : undefined;
    setCoverLetterText(priorCoverLetter?.content ?? generatedCoverLetter);
    setSelectedResumeId(requestedResume?.id ?? "");
    setSelectedEmailId("");
    setSelectedCoverLetterId(priorCoverLetter?.id ?? "");
    setResumeMessage("");
    setEmailMessage("");
    setCoverLetterMessage("");
    setApplicationRecipient("");
    setFillConfirmed(false);
    setFillMessage("");
    const priorOutreach = selectedJob
      ? outreachDrafts.find((draft) => draft.jobId === selectedJob.id)
      : undefined;
    setSelectedOutreachId(priorOutreach?.id ?? "");
    setContactName(priorOutreach?.contactName ?? "");
    setContactRole(priorOutreach?.contactRole ?? "");
    setContactEmail(priorOutreach?.contactEmail ?? "");
    setContactProfileUrl(priorOutreach?.contactProfileUrl ?? "");
    setOutreachAudience(priorOutreach?.audience ?? "recruiter");
    setFollowUpAt(priorOutreach?.followUpAt ?? "");
    setContactVerified(
      priorOutreach?.status !== "draft" && Boolean(priorOutreach),
    );
    setOutreachStatus(priorOutreach?.status ?? "draft");
    setOutreachText(
      priorOutreach?.content ??
        (selectedJob
          ? makeOutreach(profile, selectedJob, "", "", "recruiter")
          : ""),
    );
    setOutreachMessage("");
  }, [generatedResume, generatedEmail, generatedCoverLetter, selectedJob?.id, resumeToLoadId]);

  const generateWithGemini = async (
    kind: "resume" | "application-email" | "outreach",
  ) => {
    if (!selectedJob || !aiConfigured) {
      setAiMessage(aiStatusMessage || "Gemini is not configured.");
      return;
    }
    const approved = window.confirm(
      "Send your saved Master Profile facts and this job listing to Google Gemini to generate a draft? Provider usage charges may apply. The result will remain editable and will not be sent.",
    );
    if (!approved) return;
    setAiBusy(true);
    setAiMessage("Generating with Gemini…");
    try {
      const text = await onGenerateMaterial(kind, selectedJob, profile);
      if (kind === "resume") {
        setResumeText(text);
        setSelectedResumeId("");
        setResumeMessage("Gemini draft is editable. Verify every claim before use.");
      } else if (kind === "application-email") {
        setEmailText(text);
        setSelectedEmailId("");
        setEmailMessage("Gemini draft is editable and has not been sent.");
      } else {
        setOutreachText(text);
        setSelectedOutreachId("");
        setOutreachMessage("Gemini draft is editable and has not been sent.");
      }
      setAiMessage("Draft generated; verify all facts before using it.");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "Gemini generation failed.");
    } finally {
      setAiBusy(false);
    }
  };

  const connectGmail = async () => {
    setGmailBusy(true);
    setEmailMessage("Opening Google authorization…");
    try {
      await onConnectGmail();
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : "Could not connect Gmail.");
      setGmailBusy(false);
    }
  };

  const sendWithGmail = async (
    recipient: string,
    subject: string,
    body: string,
    onSuccess: (messageId: string) => void,
  ) => {
    if (!gmailConnected) {
      setEmailMessage(gmailStatusMessage || "Connect Gmail before sending.");
      setOutreachMessage(gmailStatusMessage || "Connect Gmail before sending.");
      return;
    }
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) {
      setEmailMessage("Enter a valid recipient email address.");
      setOutreachMessage("Enter a valid recipient email address.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setEmailMessage("Add a subject and message before sending.");
      return;
    }
    if (
      !window.confirm(
        `Send this plain-text email through your connected Gmail account?\n\nTo: ${recipient}\nSubject: ${subject}\n\n${body.slice(0, 600)}${body.length > 600 ? "\n…" : ""}\n\nNo resume file will be attached.`,
      )
    ) {
      return;
    }
    setGmailBusy(true);
    try {
      const messageId = await onSendEmail(recipient, subject, body);
      onSuccess(messageId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gmail could not confirm the send.";
      setEmailMessage(message);
      setOutreachMessage(message);
    } finally {
      setGmailBusy(false);
    }
  };

  const assistApplication = async () => {
    if (!selectedJob || !fillConfirmed || !tinyFishConfigured) {
      setFillMessage(
        !tinyFishConfigured
          ? "TinyFish is not configured."
          : "Confirm the data transfer before starting application assistance.",
      );
      return;
    }
    setFillBusy(true);
    setFillMessage("TinyFish is inspecting and filling eligible blank fields. Do not close this page.");
    try {
      const result = await onAssistApplication(selectedJob, profile);
      setFillMessage(
        `Filled ${result.fieldsFilled.length} field(s); skipped ${result.fieldsSkipped.length}. The application was not submitted. Review every field on the employer page.`,
      );
    } catch (error) {
      setFillMessage(error instanceof Error ? error.message : "TinyFish application assistance failed.");
    } finally {
      setFillBusy(false);
    }
  };

  const saveResume = () => {
    if (!selectedJob || !resumeText.trim()) return;
    const resume: ResumeVersion = {
      id: newId(),
      jobId: selectedJob.id,
      jobTitle: selectedJob.title,
      company: selectedJob.company,
      content: resumeText,
      createdAt: new Date().toISOString(),
    };
    onSaveResume(resume);
    setSelectedResumeId(resume.id);
    setResumeMessage("Resume version saved locally and linked to this job.");
  };

  const saveEmail = () => {
    if (!selectedJob || !emailText.trim()) return;
    const [subjectLine, ...body] = emailText.split("\n");
    const draft: ApplicationEmailDraft = {
      id: newId(),
      jobId: selectedJob.id,
      jobTitle: selectedJob.title,
      company: selectedJob.company,
      subject: subjectLine.replace(/^Subject:\s*/i, ""),
      content: body.join("\n").trim(),
      createdAt: new Date().toISOString(),
    };
    onSaveEmail(draft);
    setSelectedEmailId(draft.id);
    setEmailMessage("Email draft saved locally; it has not been sent.");
  };

  const saveCoverLetter = () => {
    if (!selectedJob || !coverLetterText.trim()) return;
    const draft: CoverLetterDraft = {
      id: newId(),
      jobId: selectedJob.id,
      jobTitle: selectedJob.title,
      company: selectedJob.company,
      content: coverLetterText,
      createdAt: new Date().toISOString(),
    };
    onSaveCoverLetter(draft);
    setSelectedCoverLetterId(draft.id);
    setCoverLetterMessage("Cover letter draft saved locally; review all details before use.");
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(emailText);
      setCopied(true);
      setEmailMessage("Draft copied to clipboard. It has not been sent.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setEmailMessage(
        "Clipboard access was denied. Select and copy the draft manually.",
      );
    }
  };

  const printResume = () => {
    if (!resumeText.trim()) {
      setResumeMessage(
        "Add factual profile details before exporting a resume.",
      );
      return;
    }
    window.print();
  };

  const linkArtifacts = () => {
    if (!selectedJob) return;
    if (!selectedResumeId || !selectedEmailId) {
      setEmailMessage(
        "Save a resume version and an email draft first to link both to the tracker.",
      );
      return;
    }
    const analysisRecord = [
      `Job: ${selectedJob.title} at ${selectedJob.company}`,
      ...(analysis?.skills.map(
        ({ skill, evidence }) =>
          `${skill}: ${evidence ?? "not evidenced in saved profile"}`,
      ) ?? []),
      `Relevant projects: ${analysis?.relevantProjects.map((project) => project.title || "Untitled project").join(", ") || "none identified"}`,
      `Education requirement: ${selectedJob.educationRequirements || "not specified; manual review needed"}`,
      `Graduation year requirement: ${selectedJob.graduationYearRequirements || "not specified; manual review needed"}`,
      `Work authorization requirement: ${selectedJob.workAuthorization || "not specified; manual review needed"}`,
      `Visa sponsorship: ${selectedJob.visaSponsorship}; confirm on employer source`,
    ].join("\n");
    onLinkToTracker(
      selectedJob,
      selectedResumeId,
      selectedEmailId,
      analysisRecord,
      selectedCoverLetterId || undefined,
    );
    setEmailMessage(
      "Resume and email draft linked to this job in your application tracker.",
    );
  };

  const saveOutreach = () => {
    if (!selectedJob || !outreachText.trim()) return;
    if (outreachStatus === "follow-up-due" && !followUpAt) {
      setOutreachMessage("Choose the follow-up date before marking it due.");
      return;
    }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      setOutreachMessage("Enter a valid email address or leave it blank.");
      return;
    }
    if (contactProfileUrl) {
      try {
        const url = new URL(contactProfileUrl);
        if (url.protocol !== "https:" || !url.hostname.includes("."))
          throw new Error("invalid");
      } catch {
        setOutreachMessage(
          "Enter a public HTTPS profile URL or leave it blank.",
        );
        return;
      }
    }
    if (outreachStatus !== "draft" && !contactVerified) {
      setOutreachMessage(
        "Confirm that the contact details are public and current before marking them verified or contacted.",
      );
      return;
    }
    const draft: OutreachDraft = {
      id: newId(),
      jobId: selectedJob.id,
      jobTitle: selectedJob.title,
      company: selectedJob.company,
      contactName,
      contactRole,
      contactEmail,
      contactProfileUrl,
      content: outreachText,
      status: outreachStatus,
      audience: outreachAudience,
      followUpAt: followUpAt || null,
      contactedAt:
        outreachStatus === "contacted"
          ? new Date().toISOString()
          : outreachDrafts.find((item) => item.id === selectedOutreachId)
              ?.contactedAt,
      createdAt: new Date().toISOString(),
    };
    onSaveOutreach(draft);
    setSelectedOutreachId(draft.id);
    setOutreachMessage(
      outreachStatus === "contacted"
        ? "Outreach marked as contacted by you. Vayora did not send it."
        : "Outreach draft saved locally; no message was sent.",
    );
  };

  return (
    <>
      <header className="cp-page-head">
        <div>
          <div className="cp-eyebrow">Application preparation</div>
          <h1 className="cp-h1">Career Studio</h1>
          <p className="cp-subtitle">
            Compare a real listing with your saved profile, then prepare
            editable materials. Nothing is submitted or sent without your
            explicit action and review.
          </p>
        </div>
      </header>
      <div className={`cp-alert ${aiConfigured ? "" : "warning"}`}>
        <span>
          {aiConfigured
            ? "Gemini generation is available. Profile and job details are shared only after you confirm each generation; review every claim."
            : aiStatusMessage || "Gemini is not configured. Current drafts are factual templates assembled from your profile and listing."}
        </span>
      </div>
      {aiMessage && <p className="career-empty-note" role="status">{aiMessage}</p>}
      <section className="cp-card career-panel">
        <Field label="Select a saved or discovered job">
          <select
            value={selectedJob?.id ?? ""}
            onChange={(event) =>
              onSelectJob(
                jobs.find((job) => job.id === event.target.value) ?? null,
              )
            }
          >
            <option value="">Choose a job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title} — {job.company}
              </option>
            ))}
          </select>
        </Field>
        {selectedJob && (
          <div className="career-selected-job">
            <strong>{selectedJob.title}</strong>
            <span>
              {selectedJob.company}
              {selectedJob.location ? ` · ${selectedJob.location}` : ""}
            </span>
            <a
              href={selectedJob.applicationUrl || selectedJob.canonicalUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open source listing
            </a>
          </div>
        )}
      </section>

      {!selectedJob ? (
        <div className="cp-card cp-empty career-empty">
          <div className="cp-empty-icon">
            <FileText size={18} />
          </div>
          <h3>Select a real job to begin</h3>
          <p>
            Run a TinyFish search, open a result, and choose “Prepare
            application”, or select a saved or tracked job above.
          </p>
        </div>
      ) : (
        <>
          <section className="cp-card career-panel">
            <div className="career-panel-heading">
              <div>
                <h2>Job analysis</h2>
                <p>
                  Rule-based comparison of listing requirements against the
                  information in your Master Profile. No match score is
                  invented.
                </p>
              </div>
            </div>
            <div className="career-analysis-block">
              <h3>Skills in the listing</h3>
              {!analysis?.skills.length && (
                <p className="career-empty-note">
                  The fetched listing did not provide structured skill
                  requirements.
                </p>
              )}
              {analysis?.skills.map(({ skill, evidence }) => (
                <div className="career-analysis-row" key={skill}>
                  <strong>{skill}</strong>
                  <span
                    className={evidence ? "career-evidence" : "career-unknown"}
                  >
                    {evidence ||
                      "Not evidenced in saved profile; confirm or develop"}
                  </span>
                </div>
              ))}
            </div>
            <div className="career-analysis-block">
              <h3>Relevant project evidence</h3>
              {analysis?.relevantProjects.length ? (
                analysis.relevantProjects.map((project, index) => (
                  <p key={`${project.title}-${index}`}>
                    <strong>{project.title || "Untitled project"}</strong>
                    {project.contribution
                      ? ` — ${project.contribution}`
                      : project.description
                        ? ` — ${project.description}`
                        : " — no contribution details provided"}
                  </p>
                ))
              ) : (
                <p className="career-empty-note">
                  No project has explicit overlap with the listing skills yet.
                  Add real project details to your Master Profile.
                </p>
              )}
            </div>
            <div className="career-analysis-block">
              <h3>Eligibility and unknowns</h3>
              <p>
                <strong>Education:</strong>{" "}
                {selectedJob.educationRequirements
                  ? `${selectedJob.educationRequirements} — compare manually with your profile; no eligibility conclusion is inferred.`
                  : "Not specified in fetched listing."}
              </p>
              <p>
                <strong>Graduation year:</strong>{" "}
                {selectedJob.graduationYearRequirements
                  ? `${selectedJob.graduationYearRequirements} — confirm manually.`
                  : "Not specified in fetched listing."}
              </p>
              <p>
                <strong>Work authorization:</strong>{" "}
                {selectedJob.workAuthorization ||
                  "Not specified in fetched listing."}{" "}
                {profile.workAuthorization
                  ? `Your profile says: ${profile.workAuthorization}. Confirm any legal declarations directly.`
                  : "Your work authorization is not recorded in the profile."}
              </p>
              <p>
                <strong>Visa sponsorship:</strong> {selectedJob.visaSponsorship}
                ; verify details on the source before applying.
              </p>
              {selectedJob.description && (
                <details className="career-job-description">
                  <summary>Show fetched job description</summary>
                  <p>{selectedJob.description}</p>
                </details>
              )}
              {!analysis?.hasSummaryEvidence && (
                <p className="career-empty-note">
                  Your profile has no summary, experience, or project
                  descriptions yet. Add verified details before relying on
                  tailored materials.
                </p>
              )}
            </div>
          </section>

          <section className="cp-card career-panel">
            <div className="career-panel-heading">
              <div>
                <h2>Job-specific resume</h2>
                <p>
                  Profile facts remain the source of truth. Projects with
                  matching listing skills are shown first; review AI wording
                  and verify every detail.
                </p>
              </div>
              <div className="career-action-group">
                <button
                  className="cp-button secondary"
                  type="button"
                  disabled={!aiConfigured || aiBusy}
                  onClick={() => void generateWithGemini("resume")}
                >
                  {aiBusy ? "Generating…" : "Generate with Gemini"}
                </button>
                <button
                  className="cp-button secondary"
                  type="button"
                  onClick={printResume}
                >
                  <Download size={14} />
                  Print / Save as PDF
                </button>
              </div>
            </div>
            {jobResumes.length > 0 && (
              <Field label="Previously saved versions for this job">
                <select
                  value={selectedResumeId}
                  onChange={(event) => {
                    const version = jobResumes.find(
                      (item) => item.id === event.target.value,
                    );
                    setSelectedResumeId(event.target.value);
                    if (version) setResumeText(version.content);
                  }}
                >
                  <option value="">Current editable draft</option>
                  {jobResumes.map((version) => (
                    <option key={version.id} value={version.id}>
                      {new Date(version.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {!resumeText.trim() && (
              <div className="cp-alert warning">
                <span>
                  Add factual information to your Master Profile to build a
                  resume. Missing details are left blank.
                </span>
              </div>
            )}
            <Field label="Editable resume preview">
              <textarea
                className="career-document"
                rows={20}
                value={resumeText}
                onChange={(event) => {
                  setResumeText(event.target.value);
                  setSelectedResumeId("");
                }}
              />
            </Field>
            <div className="career-save-row">
              <span role="status">{resumeMessage}</span>
              <button
                className="cp-button"
                type="button"
                disabled={!resumeText.trim()}
                onClick={saveResume}
              >
                <Check size={14} />
                Save new version
              </button>
            </div>
            <pre className="career-print-resume">{resumeText}</pre>
          </section>

          <section className="cp-card career-panel">
            <div className="career-panel-heading">
              <div>
                <h2>Application email draft</h2>
                <p>
                  Review the address and message. Gmail sends only after a
                  separate confirmation; no files are attached.
                </p>
              </div>
              <button
                className="cp-button secondary"
                type="button"
                disabled={!aiConfigured || aiBusy}
                onClick={() => void generateWithGemini("application-email")}
              >
                {aiBusy ? "Generating…" : "Generate with Gemini"}
              </button>
            </div>
            {jobEmails.length > 0 && (
              <Field label="Previously saved email drafts for this job">
                <select
                  value={selectedEmailId}
                  onChange={(event) => {
                    const draft = jobEmails.find(
                      (item) => item.id === event.target.value,
                    );
                    setSelectedEmailId(event.target.value);
                    if (draft)
                      setEmailText(
                        `Subject: ${draft.subject}\n\n${draft.content}`,
                      );
                  }}
                >
                  <option value="">Current editable draft</option>
                  {jobEmails.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {new Date(draft.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {gmailConfigured && !gmailConnected ? (
              <div className="career-save-row">
                <span>{gmailStatusMessage}</span>
                <button
                  className="cp-button secondary"
                  type="button"
                  disabled={gmailBusy}
                  onClick={() => void connectGmail()}
                >
                  {gmailBusy ? "Connecting…" : "Connect Gmail"}
                </button>
              </div>
            ) : !gmailConfigured ? (
              <p className="career-empty-note">{gmailStatusMessage || "Gmail OAuth is not configured on the API server."}</p>
            ) : (
              <p className="career-empty-note">{gmailStatusMessage}</p>
            )}
            <Field label="Editable email draft">
              <textarea
                className="career-document"
                rows={12}
                value={emailText}
                onChange={(event) => {
                  setEmailText(event.target.value);
                  setSelectedEmailId("");
                }}
              />
            </Field>
            {gmailConnected && (
              <Field label="Recipient email address">
                <input
                  type="email"
                  value={applicationRecipient}
                  onChange={(event) => setApplicationRecipient(event.target.value)}
                  placeholder="Verify the recipient before sending"
                />
              </Field>
            )}
            <div className="career-save-row">
              <span role="status">{emailMessage}</span>
              <div className="career-action-group">
                <button
                  className="cp-button secondary"
                  type="button"
                  onClick={copyEmail}
                >
                  <Clipboard size={14} />
                  {copied ? "Copied" : "Copy draft"}
                </button>
                {gmailConnected && (
                  <button
                    className="cp-button secondary"
                    type="button"
                    disabled={!emailText.trim() || !applicationRecipient || gmailBusy}
                    onClick={() => {
                      const [subjectLine, ...messageLines] = emailText.trim().split("\n");
                      const subject = subjectLine.replace(/^Subject:\s*/i, "").trim();
                      const body = messageLines.join("\n").trim();
                      void sendWithGmail(
                        applicationRecipient.trim(),
                        subject,
                        body,
                        (messageId) => setEmailMessage(`Gmail confirmed sent. Message ID: ${messageId}. No attachment was sent.`),
                      );
                    }}
                  >
                    {gmailBusy ? "Sending…" : "Send with Gmail"}
                  </button>
                )}
                <button
                  className="cp-button"
                  type="button"
                  disabled={!emailText.trim()}
                  onClick={saveEmail}
                >
                  <Check size={14} />
                  Save email draft
                </button>
              </div>
            </div>
            <div className="career-save-row career-tracker-link">
              <span>
                Link the saved resume and email draft, plus any selected cover
                letter, to the application tracker for this job.
              </span>
              <button
                className="cp-button secondary"
                type="button"
                disabled={!selectedResumeId || !selectedEmailId}
                onClick={linkArtifacts}
              >
                <Check size={14} />
                Link to tracker
              </button>
            </div>
          </section>

          <section className="cp-card career-panel">
            <div className="career-panel-heading">
              <div>
                <h2>Cover letter</h2>
                <p>
                  Start with verified Master Profile facts and this job
                  description. Edit and verify every claim before use.
                </p>
              </div>
              <button
                className="cp-button secondary"
                type="button"
                onClick={() => {
                  if (!selectedJob) return;
                  setCoverLetterText(makeCoverLetter(profile, selectedJob));
                  setSelectedCoverLetterId("");
                  setCoverLetterMessage("Factual cover-letter template created; verify it before use.");
                }}
              >
                Create factual template
              </button>
            </div>
            {jobCoverLetters.length > 0 && (
              <Field label="Previously saved cover letters for this job">
                <select
                  value={selectedCoverLetterId}
                  onChange={(event) => {
                    const draft = jobCoverLetters.find(
                      (item) => item.id === event.target.value,
                    );
                    setSelectedCoverLetterId(event.target.value);
                    if (draft) setCoverLetterText(draft.content);
                  }}
                >
                  <option value="">Current editable draft</option>
                  {jobCoverLetters.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {new Date(draft.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Editable cover letter">
              <textarea
                className="career-document"
                rows={16}
                value={coverLetterText}
                onChange={(event) => {
                  setCoverLetterText(event.target.value);
                  setSelectedCoverLetterId("");
                }}
              />
            </Field>
            <div className="career-save-row">
              <span role="status">{coverLetterMessage}</span>
              <div className="career-action-group">
                <button
                  className="cp-button secondary"
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(coverLetterText);
                      setCoverLetterMessage("Cover letter copied; it has not been sent.");
                    } catch {
                      setCoverLetterMessage("Clipboard access was denied. Select and copy the draft manually.");
                    }
                  }}
                  disabled={!coverLetterText.trim()}
                >
                  <Clipboard size={14} />
                  Copy draft
                </button>
                <button
                  className="cp-button"
                  type="button"
                  onClick={saveCoverLetter}
                  disabled={!coverLetterText.trim()}
                >
                  <Check size={14} />
                  Save cover letter
                </button>
              </div>
            </div>
          </section>

          <section className="cp-card career-panel">
            <div className="career-panel-heading">
              <div>
                <h2>Recruiter, hiring-manager, and referral outreach</h2>
                <p>
                  Prepare a tailored, editable draft using verified profile
                  facts and this job. Contacts are never invented; email
                  sending requires a verified address and separate confirmation.
                </p>
              </div>
              <button
                className="cp-button secondary"
                type="button"
                disabled={!aiConfigured || aiBusy}
                onClick={() => void generateWithGemini("outreach")}
              >
                {aiBusy ? "Generating…" : "Generate with Gemini"}
              </button>
            </div>
            {jobOutreach.length > 0 && (
              <Field label="Previously saved outreach drafts">
                <select
                  value={selectedOutreachId}
                  onChange={(event) => {
                    const draft = jobOutreach.find(
                      (item) => item.id === event.target.value,
                    );
                    if (!draft) return;
                    setSelectedOutreachId(draft.id);
                    setContactName(draft.contactName);
                    setContactRole(draft.contactRole);
                    setContactEmail(draft.contactEmail);
                    setContactProfileUrl(draft.contactProfileUrl);
                    setOutreachAudience(draft.audience ?? "recruiter");
                    setFollowUpAt(draft.followUpAt ?? "");
                    setContactVerified(draft.status !== "draft");
                    setOutreachStatus(draft.status);
                    setOutreachText(draft.content);
                  }}
                >
                  <option value="">Current draft</option>
                  {jobOutreach.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {draft.contactName || draft.contactRole || "Hiring team"}{" "}
                      · {new Date(draft.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="career-grid">
              <Field label="Message purpose">
                <select
                  value={outreachAudience}
                  onChange={(event) =>
                    setOutreachAudience(
                      event.target.value as NonNullable<
                        OutreachDraft["audience"]
                      >,
                    )
                  }
                >
                  <option value="recruiter">Recruiter</option>
                  <option value="hiring-manager">Hiring manager</option>
                  <option value="referral">Referral request</option>
                </select>
              </Field>
              <div className="career-field">
                <span>Follow-up date (optional)</span>
                <input
                  type="date"
                  value={followUpAt}
                  onChange={(event) => setFollowUpAt(event.target.value)}
                />
              </div>
            </div>
            <div className="career-save-row">
              <span>Generate a factual starting point; personalize it before use.</span>
              <button
                className="cp-button secondary"
                type="button"
                onClick={() => {
                  if (!selectedJob) return;
                  setOutreachText(
                    makeOutreach(
                      profile,
                      selectedJob,
                      contactName,
                      contactRole,
                      outreachAudience,
                    ),
                  );
                  setSelectedOutreachId("");
                  setOutreachMessage("Editable outreach template created; it has not been sent.");
                }}
              >
                Create tailored template
              </button>
            </div>
            <div className="career-grid">
              <Field label="Contact name (optional)">
                <input
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                />
              </Field>
              <Field label="Professional role (optional)">
                <input
                  value={contactRole}
                  onChange={(event) => setContactRole(event.target.value)}
                  placeholder="Only if verified by you"
                />
              </Field>
              <Field label="Email (optional)">
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                />
              </Field>
              <Field label="Public profile URL (optional)">
                <input
                  type="url"
                  value={contactProfileUrl}
                  onChange={(event) => setContactProfileUrl(event.target.value)}
                  placeholder="HTTPS profile you verified"
                />
              </Field>
            </div>
            <Field label="Editable outreach message">
              <textarea
                className="career-document"
                rows={9}
                value={outreachText}
                onChange={(event) => setOutreachText(event.target.value)}
              />
            </Field>
            <label className="career-contact-check">
              <input
                type="checkbox"
                checked={contactVerified}
                onChange={(event) => setContactVerified(event.target.checked)}
              />
              I verified the contact details are public and current.
            </label>
            <div className="career-grid">
              <Field label="Outreach status">
                <select
                  value={outreachStatus}
                  onChange={(event) =>
                    setOutreachStatus(
                      event.target.value as OutreachDraft["status"],
                    )
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="contact-verified">Contact verified</option>
                  <option value="contacted">Contacted by me</option>
                  <option value="follow-up-due">Follow-up due</option>
                  <option value="replied">Replied</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
            </div>
            {outreachStatus === "contacted" && (
              <p className="career-empty-note">
                This only records that you contacted them yourself; no message
                will be sent from Vayora.
              </p>
            )}
            <div className="career-save-row">
              <span role="status">{outreachMessage}</span>
              <div className="career-action-group">
                <button
                  className="cp-button secondary"
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(outreachText);
                      setOutreachMessage(
                        "Draft copied to clipboard; it has not been sent.",
                      );
                    } catch {
                      setOutreachMessage(
                        "Clipboard access was denied. Select and copy the draft manually.",
                      );
                    }
                  }}
                >
                  <Clipboard size={14} />
                  Copy draft
                </button>
                <button
                  className="cp-button"
                  type="button"
                  onClick={saveOutreach}
                >
                  <Check size={14} />
                  Save draft
                </button>
                {gmailConnected && (
                  <button
                    className="cp-button secondary"
                    type="button"
                    disabled={!contactEmail || !outreachText.trim() || gmailBusy}
                    onClick={() => {
                      if (!contactVerified) {
                        setOutreachMessage("Verify the public contact details before sending.");
                        return;
                      }
                      const subject = selectedJob
                        ? `Introduction about ${selectedJob.title} at ${selectedJob.company}`
                        : "Professional introduction";
                      void sendWithGmail(
                        contactEmail.trim(),
                        subject,
                        outreachText,
                        (messageId) => {
                          if (!selectedJob) return;
                          const sentDraft: OutreachDraft = {
                            id: newId(),
                            jobId: selectedJob.id,
                            jobTitle: selectedJob.title,
                            company: selectedJob.company,
                            contactName,
                            contactRole,
                            contactEmail,
                            contactProfileUrl,
                            content: outreachText,
                            status: "contacted",
                            audience: outreachAudience,
                            followUpAt: followUpAt || null,
                            contactedAt: new Date().toISOString(),
                            createdAt: new Date().toISOString(),
                          };
                          onSaveOutreach(sentDraft);
                          onLinkOutreach(selectedJob, sentDraft.id, sentDraft);
                          setSelectedOutreachId(sentDraft.id);
                          setOutreachStatus("contacted");
                          setOutreachMessage(`Gmail confirmed sent. Outreach was saved and linked to the tracker. Message ID: ${messageId}.`);
                        },
                      );
                    }}
                  >
                    {gmailBusy ? "Sending…" : "Send outreach with Gmail"}
                  </button>
                )}
              </div>
            </div>
            <div className="career-save-row career-tracker-link">
              <span>
                Link this saved outreach record to the existing application
                tracker.
              </span>
              <button
                className="cp-button secondary"
                type="button"
                disabled={!selectedOutreachId}
                onClick={() => {
                  if (selectedJob && selectedOutreachId) {
                    onLinkOutreach(selectedJob, selectedOutreachId);
                    setOutreachMessage(
                      "Outreach record linked to your application tracker.",
                    );
                  }
                }}
              >
                <Check size={14} />
                Link outreach
              </button>
            </div>
          </section>

          <section className="cp-card career-panel">
            <div className="career-panel-heading">
              <div>
                <h2>Application handoff</h2>
                <p>
                  TinyFish Agent can assist with factual profile fields on a
                  public form. It runs in TinyFish’s remote browser, not your
                  local Chrome tab; fields are not guaranteed to transfer back
                  to this browser.
                </p>
              </div>
            </div>
            <div className="cp-alert warning">
              <span>
                TinyFish receives your selected profile facts and the target
                employer URL. This can use paid Agent credits. It must not
                submit, upload files, or answer legal/eligibility questions.
                Review the employer page yourself before continuing.
              </span>
            </div>
            <p className="career-empty-note">
              Target employer host: <strong>{applicationHost}</strong>
            </p>
            <label className="career-consent">
              <input
                type="checkbox"
                checked={fillConfirmed}
                onChange={(event) => {
                  setFillConfirmed(event.target.checked);
                  setFillMessage("");
                }}
              />
              I reviewed this host and consent to sending my profile facts to
              TinyFish and this application page for form assistance.
            </label>
            <div className="career-save-row">
              <span role="status">{fillMessage}</span>
              <button
                className="cp-button"
                type="button"
                disabled={!tinyFishConfigured || !fillConfirmed || fillBusy}
                onClick={() => void assistApplication()}
              >
                {fillBusy ? "Working with TinyFish…" : "Assist with application fields"}
              </button>
            </div>
            <div className="career-analysis-block">
              <h3>Profile details to review before entering a form</h3>
              {[
                ["Name", profile.fullName],
                ["Email", profile.email],
                ["Phone", profile.phone],
                ["Location", profile.location],
                [
                  "Education",
                  [
                    profile.degree,
                    profile.branch,
                    profile.institution,
                    profile.graduationYear,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                ],
                ["Work authorization", profile.workAuthorization],
                ["Skills", profile.skills.join(", ")],
              ].map(([label, value]) => (
                <div className="career-analysis-row" key={label}>
                  <strong>{label}</strong>
                  <span
                    className={value ? "career-evidence" : "career-unknown"}
                  >
                    {value || "Not in profile — do not guess"}
                  </span>
                </div>
              ))}
            </div>
            <div className="cp-alert warning">
              <span>
                Review every populated field and legal declaration yourself.
                The remote Agent may not share its browser state with your
                Chrome tab. The Chrome companion can fill only blank factual
                text fields locally after you click its toolbar button.
              </span>
            </div>
            <a
              className="cp-button"
              href={selectedJob.applicationUrl || selectedJob.canonicalUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open employer application page
            </a>
          </section>
        </>
      )}
    </>
  );
}
