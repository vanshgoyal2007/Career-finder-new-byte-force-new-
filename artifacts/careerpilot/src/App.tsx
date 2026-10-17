import { useEffect, useMemo, useState, type ReactNode, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import * as CareerPilotApi from '@workspace/api-client-react';
import { Activity, AlertCircle, ArrowDownRight, ArrowRight, Bookmark, BriefcaseBusiness, Building2, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, ExternalLink, FileText, Filter, Info, LayoutDashboard, LoaderCircle, MapPin, Search, Settings2, ShieldCheck, SlidersHorizontal, Target, Trash2, UserRound, Wallet, X } from 'lucide-react';
import {
  CareerStudioPage,
  MasterProfilePage,
  emptyMasterProfile,
  type ApplicationEmailDraft,
  type CareerStudioJob,
  type CoverLetterDraft,
  type MasterProfile,
  type OutreachDraft,
  type ResumeVersion,
} from './career-workflow';
import './careerpilot.css';

const queryClient = new QueryClient();
type CareerSearchInput = {
  query: string; role?: string | null; location?: string | null; opportunityType: 'internship' | 'full-time' | 'both';
  experienceLevel?: string | null; skills?: string[]; degree?: string | null; branch?: string | null; graduationYear?: number | null;
  targetCompanies?: string[]; preferredIndustries?:string[]; workAuthorization?:string|null;
  workArrangement?: 'remote' | 'hybrid' | 'onsite' | null; minimumCompensation?: number | null;
  minimumCompensationCurrency?:string|null;minimumCompensationPeriod?:'hourly'|'monthly'|'annual'|'total'|null;
  visaSponsorship?: 'offered' | 'not-offered' | 'any' | null;
};
type JobListing = {
  id:string; canonicalUrl:string; title:string; company:string; companyUrl?:string|null; applicationUrl?:string|null; sourceName:string; sourceUrl:string;
  description?:string|null; location?:string|null; workArrangement?:'remote'|'hybrid'|'onsite'|null; employmentType:string; experienceLevel?:string|null;
  requiredSkills:string[]; preferredSkills:string[]; educationRequirements?:string|null; graduationYearRequirements?:string|null;
  salaryMin?:number|null; salaryMax?:number|null; salaryCurrency?:string|null; payPeriod?:string|null; postedAt?:string|null; deadline?:string|null;
  visaSponsorship:string; workAuthorization?:string|null; lastCheckedAt:string; listingStatus:string; verificationConfidence:number; verificationNote:string;
  matchScore:number; matchExplanation:string; matchBreakdown:{label:string;status:string;explanation:string;points:number}[]; alternativeSources:string[];
};
type CareerSearchResult = {query:string;results:JobListing[];sourcesQueried:number;successfulSources:number;failedSources:number;partialResults:boolean;warnings:string[];scannedAt:string;stages:{name:string;completed:boolean;detail:string}[]};
type StatusResponse = {provider:string;configured:boolean;message:string};
type AiStatusResponse = { provider: string; configured: boolean; message: string };
type GmailStatusResponse = { provider: string; configured: boolean; connected: boolean; message: string };
type VerificationResponse = {listingStatus:string;applicationUrlReachable:boolean|null;checkedAt:string;confidence:number;explanation:string;evidence:string};
type TrackerItem = {job:JobListing;stage:string;updatedAt:string;applicationDate:string|null;notes:string;reminderAt:string|null;resumeVersionId?:string;emailDraftId?:string;coverLetterId?:string;jobAnalysis?:string;outreachDraftId?:string;outreachStatus?:string;outreachFollowUpAt?:string|null};
type ApiHooks = {
  useGetCareerPilotStatus: () => {isLoading:boolean;isError:boolean;data?:StatusResponse};
  useSearchCareerPilotJobs: () => {isPending:boolean;isError:boolean;error:unknown;mutate:(variables:{data:CareerSearchInput},callbacks?:{onSuccess?:(result:CareerSearchResult)=>void;onError?:()=>void})=>void};
  useVerifyCareerPilotListing: () => {isPending:boolean;mutate:(variables:{data:{url:string;title:string;company:string;applicationUrl?:string|null}},callbacks?:{onSuccess?:(result:VerificationResponse)=>void;onError?:()=>void})=>void};
};
const { useGetCareerPilotStatus, useSearchCareerPilotJobs, useVerifyCareerPilotListing } = CareerPilotApi as unknown as ApiHooks;

const stages = ['Interested', 'Preparing', 'Applied', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];
const localRead = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
const money = (job: JobListing) => {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const currency = job.salaryCurrency || 'USD';
  const amount = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  return `${job.salaryMin != null ? amount(job.salaryMin) : ''}${job.salaryMin != null && job.salaryMax != null ? ' – ' : ''}${job.salaryMax != null ? amount(job.salaryMax) : ''}${job.payPeriod ? ` / ${job.payPeriod}` : ''}`;
};
const pretty = (value?: string | null) => value ? value.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
const shortDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

function capturedJobListing(job: CareerStudioJob): JobListing {
  return {
    id: job.id,
    canonicalUrl: job.canonicalUrl,
    title: job.title,
    company: job.company,
    companyUrl: null,
    applicationUrl: job.applicationUrl ?? job.canonicalUrl,
    sourceName: job.sourceName,
    sourceUrl: job.canonicalUrl,
    description: job.description ?? null,
    location: job.location ?? null,
    workArrangement: null,
    employmentType: 'unknown',
    experienceLevel: null,
    requiredSkills: job.requiredSkills,
    preferredSkills: job.preferredSkills,
    educationRequirements: job.educationRequirements ?? null,
    graduationYearRequirements: job.graduationYearRequirements ?? null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    payPeriod: null,
    postedAt: null,
    deadline: null,
    visaSponsorship: job.visaSponsorship,
    workAuthorization: job.workAuthorization ?? null,
    lastCheckedAt: new Date().toISOString(),
    listingStatus: 'verification-needed',
    verificationConfidence: 0,
    verificationNote: 'Captured from a browser page; Vayora has not verified the source.',
    matchScore: 0,
    matchExplanation: 'No match score has been calculated for this captured page.',
    matchBreakdown: [],
    alternativeSources: [],
  };
}

function AppShell() {
  const [path, navigate] = useLocation();
  const [saved, setSaved] = useState<JobListing[]>(() => localRead('careerpilot.saved.v1', []));
  const [tracker, setTracker] = useState<TrackerItem[]>(() => localRead('careerpilot.tracker.v1', []));
  const [profile, setProfile] = useState<CareerSearchInput>(() => localRead('careerpilot.preferences.v1', {
    query: '', role: '', location: '', opportunityType: 'both', experienceLevel: 'Entry level', skills: [], degree: '', branch: '', graduationYear: null, targetCompanies: [], preferredIndustries:[], workAuthorization:'', workArrangement: null, minimumCompensation: null, minimumCompensationCurrency:null, minimumCompensationPeriod:null, visaSponsorship: null,
  }));
  const [masterProfile, setMasterProfile] = useState<MasterProfile>(() => localRead('careerpilot.masterProfile.v1', emptyMasterProfile));
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>(() => localRead('careerpilot.resumeVersions.v1', []));
  const [emailDrafts, setEmailDrafts] = useState<ApplicationEmailDraft[]>(() => localRead('careerpilot.emailDrafts.v1', []));
  const [coverLetters, setCoverLetters] = useState<CoverLetterDraft[]>(() => localRead('careerpilot.coverLetters.v1', []));
  const [outreachDrafts, setOutreachDrafts] = useState<OutreachDraft[]>(() => localRead('careerpilot.outreachDrafts.v1', []));
  const [studioJob, setStudioJob] = useState<CareerStudioJob | null>(() => localRead('careerpilot.studioJob.v1', null));
  const [resumeToLoadId, setResumeToLoadId] = useState<string | null>(null);
  const [searchData, setSearchData] = useState<CareerSearchResult | null>(null);
  const [newSincePreviousScan, setNewSincePreviousScan] = useState<number | null>(null);
  const [selected, setSelected] = useState<JobListing | null>(null);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState(profile.query || '');
  const [role, setRole] = useState(profile.role || '');
  const [location, setSearchLocation] = useState(profile.location || '');
  const [opportunityType, setOpportunityType] = useState<CareerSearchInput['opportunityType']>(profile.opportunityType || 'both');
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);
  const [verification, setVerification] = useState<Record<string, { explanation: string; evidence: string; checkedAt: string; confidence: number; listingStatus: string; applicationUrlReachable: boolean | null }>>({});
  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatusResponse | null>(null);
  const [integrationError, setIntegrationError] = useState('');
  const status = useGetCareerPilotStatus();
  const search = useSearchCareerPilotJobs();
  const verify = useVerifyCareerPilotListing();
  const currentPage = path === '/saved' ? 'Saved jobs' : path === '/tracker' ? 'Application tracker' : path === '/preferences' ? 'Search preferences' : path === '/master-profile' ? 'Master Profile' : path === '/career-studio' ? 'Career Studio' : path === '/settings' ? 'Settings' : 'Discover jobs';

  useEffect(() => { localStorage.setItem('careerpilot.saved.v1', JSON.stringify(saved)); }, [saved]);
  useEffect(() => { localStorage.setItem('careerpilot.tracker.v1', JSON.stringify(tracker)); }, [tracker]);
  useEffect(() => { localStorage.setItem('careerpilot.preferences.v1', JSON.stringify(profile)); }, [profile]);
  useEffect(() => { localStorage.setItem('careerpilot.masterProfile.v1', JSON.stringify(masterProfile)); }, [masterProfile]);
  useEffect(() => { localStorage.setItem('careerpilot.resumeVersions.v1', JSON.stringify(resumeVersions)); }, [resumeVersions]);
  useEffect(() => { localStorage.setItem('careerpilot.emailDrafts.v1', JSON.stringify(emailDrafts)); }, [emailDrafts]);
  useEffect(() => { localStorage.setItem('careerpilot.coverLetters.v1', JSON.stringify(coverLetters)); }, [coverLetters]);
  useEffect(() => { localStorage.setItem('careerpilot.outreachDrafts.v1', JSON.stringify(outreachDrafts)); }, [outreachDrafts]);
  useEffect(() => {
    if (studioJob) localStorage.setItem('careerpilot.studioJob.v1', JSON.stringify(studioJob));
    else localStorage.removeItem('careerpilot.studioJob.v1');
  }, [studioJob]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const controller = new AbortController();
    const loadStatuses = async () => {
      try {
        const [aiResponse, gmailResponse] = await Promise.all([
          fetch('/api/careerpilot/ai/status', { signal: controller.signal }),
          fetch('/api/careerpilot/gmail/status', { signal: controller.signal }),
        ]);
        if (!aiResponse.ok || !gmailResponse.ok) {
          throw new Error('Could not check AI and Gmail configuration.');
        }
        const [aiData, gmailData] = await Promise.all([
          aiResponse.json() as Promise<AiStatusResponse>,
          gmailResponse.json() as Promise<GmailStatusResponse>,
        ]);
        setAiStatus(aiData);
        setGmailStatus(gmailData);
      } catch (error) {
        if (!controller.signal.aborted) {
          setIntegrationError(error instanceof Error ? error.message : 'Could not check integration status.');
        }
      }
    };
    void loadStatuses();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const gmailResult = new URLSearchParams(window.location.search).get('gmail');
    if (!gmailResult) return;
    setToast(gmailResult === 'connected' ? 'Gmail connected for this server session' : 'Gmail connection was not completed');
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  useEffect(() => {
    const capture = new URLSearchParams(window.location.search).get('capture');
    if (!capture) return;
    try {
      const data: unknown = JSON.parse(capture);
      if (!data || typeof data !== 'object') throw new Error('Invalid capture.');
      const record = data as Record<string, unknown>;
      const url = typeof record.url === 'string' ? new URL(record.url) : null;
      const title = typeof record.title === 'string' ? record.title.trim().slice(0, 300) : '';
      const company = typeof record.company === 'string' ? record.company.trim().slice(0, 200) : '';
      const location = typeof record.location === 'string' ? record.location.trim().slice(0, 200) : '';
      const description = typeof record.description === 'string' ? record.description.trim().slice(0, 4000) : '';
      if (!url || url.protocol !== 'https:' || !title || !company) {
        throw new Error('Capture must include a public HTTPS job URL, title, and company.');
      }
      setStudioJob({
        id: `capture-${globalThis.crypto.randomUUID()}`,
        canonicalUrl: url.toString(),
        title,
        company,
        applicationUrl: url.toString(),
        sourceName: 'Chrome companion',
        description: description || null,
        location: location || null,
        requiredSkills: [],
        preferredSkills: [],
        visaSponsorship: 'not-specified',
      });
      navigate('/career-studio');
      setToast('Captured job opening from the Chrome companion');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not import this job capture.');
    } finally {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [navigate]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get('resumeVersion');
    if (!resumeId) return;
    const version = resumeVersions.find((item) => item.id === resumeId);
    const job = [
      ...(searchData?.results ?? []),
      ...saved,
      ...tracker.map((item) => item.job),
      ...(studioJob ? [studioJob] : []),
    ].find((item) => item.id === version?.jobId);
    if (!version || !job) {
      setToast("Save or track the job linked to this resume before opening it from the companion.");
    } else {
      setStudioJob({
        id: job.id,
        canonicalUrl: job.canonicalUrl,
        title: job.title,
        company: job.company,
        applicationUrl: job.applicationUrl,
        sourceName: job.sourceName,
        description: job.description,
        location: job.location,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        educationRequirements: job.educationRequirements,
        graduationYearRequirements: job.graduationYearRequirements,
        workAuthorization: job.workAuthorization,
        visaSponsorship: job.visaSponsorship,
      });
      setResumeToLoadId(version.id);
      navigate("/career-studio");
      setToast("Opened the saved job-specific resume for review.");
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [navigate, resumeVersions, searchData, saved, tracker, studioJob]);

  const toggleSaved = (job: JobListing) => {
    const exists = saved.some(item => item.id === job.id);
    setSaved(prev => exists ? prev.filter(item => item.id !== job.id) : [job, ...prev]);
    setToast(exists ? 'Removed from saved jobs' : 'Opening saved for later');
  };
  const addToTracker = (job: JobListing) => {
    if (tracker.some(item => item.job.id === job.id)) { navigate('/tracker'); setToast('Already in your tracker'); return; }
    setTracker(prev => [{ job, stage: 'Interested', updatedAt: new Date().toISOString(), applicationDate: null, notes: '', reminderAt: null }, ...prev]);
    setToast('Added to your application tracker');
  };
  const openCareerStudio = (job: CareerStudioJob) => {
    setStudioJob(job);
    setSelected(null);
    navigate('/career-studio');
  };
  const saveMasterProfile = (nextProfile: MasterProfile) => {
    setMasterProfile(nextProfile);
    setProfile(current => ({
      ...current,
      skills: nextProfile.skills,
      degree: nextProfile.degree || null,
      branch: nextProfile.branch || null,
      graduationYear: nextProfile.graduationYear ? Number(nextProfile.graduationYear) : null,
      workAuthorization: nextProfile.workAuthorization || null,
      location: nextProfile.location || null,
    }));
    setToast('Master Profile saved and applied to matching');
  };
  const linkApplicationArtifacts = (job: CareerStudioJob, resumeVersionId: string, emailDraftId: string, jobAnalysis: string, coverLetterId?: string) => {
    const fullJob = [
      ...(searchData?.results ?? []),
      ...saved,
      ...tracker.map(item => item.job),
      ...(selected ? [selected] : []),
      ...(studioJob ? [capturedJobListing(studioJob)] : []),
    ].find(item => item.id === job.id);
    if (!fullJob) {
      setToast('Could not find this listing in saved application data');
      return;
    }
    setTracker(current => {
      const existing = current.find(item => item.job.id === job.id);
      if (existing) {
        return current.map(item => item.job.id === job.id
          ? { ...item, resumeVersionId, emailDraftId, coverLetterId, jobAnalysis, updatedAt: new Date().toISOString() }
          : item);
      }
      return [{
        job: fullJob,
        stage: 'Preparing',
        updatedAt: new Date().toISOString(),
        applicationDate: null,
        notes: '',
        reminderAt: null,
        resumeVersionId,
        emailDraftId,
        coverLetterId,
        jobAnalysis,
      }, ...current];
    });
    setToast('Resume and email draft linked in your tracker');
  };
  const linkOutreachDraft = (job: CareerStudioJob, outreachDraftId: string, savedDraft?: OutreachDraft) => {
    const fullJob = [
      ...(searchData?.results ?? []),
      ...saved,
      ...tracker.map(item => item.job),
      ...(selected ? [selected] : []),
      ...(studioJob ? [capturedJobListing(studioJob)] : []),
    ].find(item => item.id === job.id);
    const draft = savedDraft ?? outreachDrafts.find(item => item.id === outreachDraftId);
    if (!fullJob || !draft) {
      setToast('Could not find the job or saved outreach draft');
      return;
    }
    setTracker(current => {
      const existing = current.find(item => item.job.id === job.id);
      if (existing) {
        return current.map(item => item.job.id === job.id
          ? { ...item, outreachDraftId, outreachStatus: draft.status, outreachFollowUpAt: draft.followUpAt ?? null, updatedAt: new Date().toISOString() }
          : item);
      }
      return [{
        job: fullJob,
        stage: 'Interested',
        updatedAt: new Date().toISOString(),
        applicationDate: null,
        notes: '',
        reminderAt: null,
        outreachDraftId,
        outreachStatus: draft.status,
        outreachFollowUpAt: draft.followUpAt ?? null,
      }, ...current];
    });
    setToast('Outreach record linked in your tracker');
  };
  const clearBrowserData = () => {
    for (const key of [
      'careerpilot.saved.v1',
      'careerpilot.tracker.v1',
      'careerpilot.preferences.v1',
      'careerpilot.masterProfile.v1',
      'careerpilot.resumeVersions.v1',
      'careerpilot.emailDrafts.v1',
      'careerpilot.coverLetters.v1',
      'careerpilot.outreachDrafts.v1',
      'careerpilot.studioJob.v1',
      'careerpilot.lastSearchIds.v1',
    ]) {
      localStorage.removeItem(key);
    }
    setSaved([]);
    setTracker([]);
    setProfile({ query:'',role:'',location:'',opportunityType:'both',skills:[],preferredIndustries:[],workAuthorization:'',targetCompanies:[],workArrangement:null,minimumCompensation:null,minimumCompensationCurrency:null,minimumCompensationPeriod:null,visaSponsorship:null });
    setMasterProfile(emptyMasterProfile);
    setResumeVersions([]);
    setEmailDrafts([]);
    setCoverLetters([]);
    setOutreachDrafts([]);
    setStudioJob(null);
    setNewSincePreviousScan(null);
    setToast('Browser data cleared');
  };
  const generateMaterial = async (
    kind: 'resume' | 'application-email' | 'outreach',
    job: CareerStudioJob,
    profileData: MasterProfile,
  ) => {
    const response = await fetch('/api/careerpilot/generate-materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        job,
        profile: profileData,
        consentToSendProfileToGemini: true,
      }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'AI generation failed. Review the provider status and retry.';
      throw new Error(message);
    }
    if (!body || typeof body !== 'object' || !('text' in body) || typeof body.text !== 'string') {
      throw new Error('Gemini returned an invalid draft response.');
    }
    return body.text;
  };
  const connectGmail = async () => {
    const response = await fetch('/api/careerpilot/gmail/oauth/start');
    const body: unknown = await response.json();
    if (!response.ok || !body || typeof body !== 'object' || !('authorizationUrl' in body) || typeof body.authorizationUrl !== 'string') {
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Could not start Gmail authorization.';
      throw new Error(message);
    }
    window.location.assign(body.authorizationUrl);
  };
  const sendGmailEmail = async (to: string, subject: string, text: string) => {
    const response = await fetch('/api/careerpilot/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, text, confirmSend: true }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Gmail did not confirm the message was sent.';
      throw new Error(message);
    }
    if (!body || typeof body !== 'object' || !('messageId' in body) || typeof body.messageId !== 'string') {
      throw new Error('Gmail returned no message confirmation.');
    }
    return body.messageId;
  };
  const assistApplication = async (
    job: CareerStudioJob,
    profileData: MasterProfile,
  ) => {
    const applicationProfile = {
      fullName: profileData.fullName,
      email: profileData.email,
      phone: profileData.phone,
      location: profileData.location,
      headline: profileData.headline,
      summary: profileData.summary,
      degree: profileData.degree,
      branch: profileData.branch,
      institution: profileData.institution,
      graduationYear: profileData.graduationYear,
      skills: profileData.skills,
      github: profileData.github,
      linkedin: profileData.linkedin,
      portfolio: profileData.portfolio,
      projects: profileData.projects,
      experience: profileData.experience,
    };
    const response = await fetch('/api/careerpilot/application-assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: job.applicationUrl || job.canonicalUrl,
        title: job.title,
        company: job.company,
        profile: applicationProfile,
        confirmPersonalDataTransfer: true,
      }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'TinyFish application assistance failed.';
      throw new Error(message);
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !('submissionStatus' in body) ||
      body.submissionStatus !== 'not_submitted' ||
      !('fieldsFilled' in body) ||
      !Array.isArray(body.fieldsFilled) ||
      !('fieldsSkipped' in body) ||
      !Array.isArray(body.fieldsSkipped)
    ) {
      throw new Error('TinyFish did not confirm that the application remains unsubmitted.');
    }
    return {
      fieldsFilled: body.fieldsFilled.filter((item): item is string => typeof item === 'string'),
      fieldsSkipped: body.fieldsSkipped.filter((item): item is string => typeof item === 'string'),
      submissionStatus: 'not_submitted' as const,
    };
  };
  const runSearch = () => {
    const searchInput: CareerSearchInput = {
      ...profile,
      query: query.trim() || role.trim(),
      role: role.trim() || null,
      location: location.trim() || null,
      opportunityType,
      skills: profile.skills || [],
      targetCompanies: profile.targetCompanies || [],
    };
    if (searchInput.query.length < 2) { setToast('Enter a role or search phrase to begin'); return; }
    setSearchData(null);
    search.mutate({ data: searchInput }, { onSuccess: result => {
      const signature=[searchInput.query,searchInput.role||'',searchInput.location||'',searchInput.opportunityType].map(value=>value.trim().toLowerCase()).join('|');
      const previousScan = localRead<{signature:string;ids:string[]}|null>('careerpilot.lastSearchIds.v1', null);
      setNewSincePreviousScan(previousScan?.signature===signature ? result.results.filter(job => !previousScan.ids.includes(job.id)).length : null);
      localStorage.setItem('careerpilot.lastSearchIds.v1', JSON.stringify({signature,ids:result.results.map(job => job.id)}));
      setSearchData(result);
      setToast(`Search complete · ${result.results.length} openings found`);
    }, onError: () => setToast('Search could not complete. Review the error below and retry.') });
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    runSearch();
  };
  const runSearchWithProfile = (nextProfile: CareerSearchInput) => {
    setProfile(nextProfile);
    setQuery(nextProfile.query || nextProfile.role || '');
    setRole(nextProfile.role || '');
    setSearchLocation(nextProfile.location || '');
    setOpportunityType(nextProfile.opportunityType || 'both');
    navigate('/');
    setToast('Search profile applied');
  };
  const verifyJob = (job: JobListing) => verify.mutate({ data: { url: job.canonicalUrl, title: job.title, company: job.company, applicationUrl: job.applicationUrl || null } }, {
    onSuccess: result => { setVerification(prev => ({ ...prev, [job.id]: result })); setToast('Listing checked against its live source'); },
    onError: () => setToast('Could not verify this listing. Try again shortly.'),
  });

  const sidebar = <aside className="cp-sidebar">
    <Link href="/" className="cp-brand" data-testid="link-brand"><span className="cp-logo"><NavigationLogo /></span><span>Vayora</span></Link>
    <div className="cp-nav-label">Workspace</div>
    <nav className="cp-nav" aria-label="Main navigation">
      <Link href="/" className={path === '/' ? 'active' : ''} data-testid="link-discover"><Search size={16}/>Discover jobs</Link>
      <Link href="/saved" className={path === '/saved' ? 'active' : ''} data-testid="link-saved"><Bookmark size={16}/>Saved jobs{saved.length > 0 && <span className="cp-nav-count">{saved.length}</span>}</Link>
      <Link href="/tracker" className={path === '/tracker' ? 'active' : ''} data-testid="link-tracker"><LayoutDashboard size={16}/>Application tracker{tracker.length > 0 && <span className="cp-nav-count">{tracker.length}</span>}</Link>
    </nav>
    <div className="cp-nav-label" style={{ marginTop: 24 }}>Your account</div>
    <nav className="cp-nav">
      <Link href="/master-profile" className={path === '/master-profile' ? 'active' : ''} data-testid="link-master-profile"><UserRound size={16}/>Master Profile</Link>
      <Link href="/career-studio" className={path === '/career-studio' ? 'active' : ''} data-testid="link-career-studio"><FileText size={16}/>Career Studio</Link>
      <Link href="/preferences" className={path === '/preferences' ? 'active' : ''} data-testid="link-preferences"><SlidersHorizontal size={16}/>Search preferences</Link>
      <Link href="/settings" className={path === '/settings' ? 'active' : ''} data-testid="link-settings"><Settings2 size={16}/>Settings</Link>
    </nav>
    <div className="cp-sidebar-bottom"><div className="cp-source-state"><ShieldCheck size={16} color="#329364"/><span>Openings are checked against their source. Your saved data stays in this browser.</span></div></div>
  </aside>;

  return <div className="cp-shell">{sidebar}<main className="cp-main">
    <header className="cp-topbar"><div className="cp-crumb"><span>Vayora</span><ArrowRight size={12}/><strong>{currentPage}</strong></div><div className="cp-live"><span className="cp-live-dot"/>{status.isLoading ? 'Checking search availability' : status.isError ? 'Search status unavailable' : status.data?.configured ? 'Live search ready' : 'Search provider not configured'}</div></header>
    <div className="cp-content"><RoutedErrorBoundary><Switch>
      <Route path="/">
        <Discover query={query} setQuery={setQuery} role={role} setRole={setRole} location={location} setLocation={setSearchLocation} opportunityType={opportunityType} setOpportunityType={setOpportunityType} onSearch={submitSearch} onRefresh={runSearch} search={search} searchData={searchData} newSincePreviousScan={newSincePreviousScan} status={status} saved={saved} toggleSaved={toggleSaved} openJob={setSelected} addToTracker={addToTracker} verification={verification} verifyJob={verifyJob} verifyPending={verify.isPending} filtersOpen={searchFiltersOpen} setFiltersOpen={setSearchFiltersOpen} profile={profile} />
      </Route>
      <Route path="/saved">
        <SavedPage jobs={saved} toggleSaved={toggleSaved} openJob={setSelected} addToTracker={addToTracker} />
      </Route>
      <Route path="/tracker">
        <TrackerPage items={tracker} setTracker={setTracker} openJob={setSelected} openStudio={openCareerStudio} />
      </Route>
      <Route path="/preferences"><Preferences profile={profile} setProfile={setProfile} onSearch={runSearchWithProfile} /></Route>
      <Route path="/master-profile"><MasterProfilePage profile={masterProfile} onSave={saveMasterProfile} /></Route>
      <Route path="/career-studio">
        <CareerStudioPage
          profile={masterProfile}
          jobs={[...new Map([...(studioJob ? [studioJob] : []), ...saved, ...tracker.map(item => item.job), ...(searchData?.results ?? [])].map(job => [job.id, job])).values()]}
          selectedJob={studioJob}
          resumeToLoadId={resumeToLoadId}
          onSelectJob={setStudioJob}
          resumes={resumeVersions}
          emailDrafts={emailDrafts}
          outreachDrafts={outreachDrafts}
          onSaveResume={resume => setResumeVersions(current => [resume, ...current])}
          onSaveEmail={draft => setEmailDrafts(current => [draft, ...current])}
          onSaveCoverLetter={draft => setCoverLetters(current => [draft, ...current])}
          coverLetters={coverLetters}
          onSaveOutreach={draft => setOutreachDrafts(current => [draft, ...current])}
          onLinkToTracker={linkApplicationArtifacts}
          onLinkOutreach={linkOutreachDraft}
          aiConfigured={Boolean(aiStatus?.configured)}
          aiStatusMessage={aiStatus?.message ?? integrationError}
          gmailConfigured={Boolean(gmailStatus?.configured)}
          gmailConnected={Boolean(gmailStatus?.connected)}
          gmailStatusMessage={gmailStatus?.message ?? integrationError}
          tinyFishConfigured={Boolean(status.data?.configured)}
          onGenerateMaterial={generateMaterial}
          onConnectGmail={connectGmail}
          onSendEmail={sendGmailEmail}
          onAssistApplication={assistApplication}
        />
      </Route>
      <Route path="/settings">
        <Settings savedCount={saved.length} trackerCount={tracker.length} clearData={clearBrowserData} />
      </Route>
      <Route component={NotFound} />
    </Switch></RoutedErrorBoundary></div>
  </main>
   {selected && <JobDetail job={selected} close={() => setSelected(null)} saved={saved.some(job => job.id === selected.id)} toggleSaved={() => toggleSaved(selected)} addToTracker={() => addToTracker(selected)} prepareApplication={() => openCareerStudio(selected)} verify={() => verifyJob(selected)} verifying={verify.isPending} verification={verification[selected.id]} />}
  {toast && <div className="cp-toast" role="status" data-testid="status-toast">{toast}</div>}
  </div>;
}

function NavigationLogo() { return <BriefcaseBusiness size={18} strokeWidth={2.2}/>; }

function Discover(props: {
  query:string;setQuery:(v:string)=>void;role:string;setRole:(v:string)=>void;location:string;setLocation:(v:string)=>void;opportunityType:CareerSearchInput['opportunityType'];setOpportunityType:(v:CareerSearchInput['opportunityType'])=>void;onSearch:(e:FormEvent)=>void;onRefresh:()=>void;search:ReturnType<typeof useSearchCareerPilotJobs>;searchData:CareerSearchResult|null;newSincePreviousScan:number|null;status:ReturnType<typeof useGetCareerPilotStatus>;saved:JobListing[];toggleSaved:(job:JobListing)=>void;openJob:(job:JobListing)=>void;addToTracker:(job:JobListing)=>void;verification:Record<string, { explanation:string;evidence:string;checkedAt:string;confidence:number;listingStatus:string;applicationUrlReachable:boolean|null }>;verifyJob:(job:JobListing)=>void;verifyPending:boolean;filtersOpen:boolean;setFiltersOpen:(v:boolean)=>void;profile:CareerSearchInput;
}) {
  const [savedOnly, setSavedOnly] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [experienceFilter, setExperienceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [arrangementFilter, setArrangementFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [visaFilter, setVisaFilter] = useState('');
  const [authorizationFilter, setAuthorizationFilter] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState('');
  const [minimumSalary, setMinimumSalary] = useState('');
  const [postedAfter, setPostedAfter] = useState('');
  const [deadlineBefore, setDeadlineBefore] = useState('');
  const [sortBy, setSortBy] = useState('best');
  const clearFilters = () => {
    setCompanyFilter('');setLocationFilter('');setSkillFilter('');setExperienceFilter('');setTypeFilter('');
    setArrangementFilter('');setStatusFilter('');setVisaFilter('');setAuthorizationFilter('');setEligibilityFilter('');
    setMinimumSalary('');setPostedAfter('');setDeadlineBefore('');setSavedOnly(false);
  };
  const activeFilters = [
    companyFilter && {label:`Company: ${companyFilter}`,clear:()=>setCompanyFilter('')},
    locationFilter && {label:`Location: ${locationFilter}`,clear:()=>setLocationFilter('')},
    skillFilter && {label:`Skill: ${skillFilter}`,clear:()=>setSkillFilter('')},
    experienceFilter && {label:`Experience: ${experienceFilter}`,clear:()=>setExperienceFilter('')},
    typeFilter && {label:`Type: ${pretty(typeFilter)}`,clear:()=>setTypeFilter('')},
    arrangementFilter && {label:`Work: ${pretty(arrangementFilter)}`,clear:()=>setArrangementFilter('')},
    statusFilter && {label:`Status: ${pretty(statusFilter)}`,clear:()=>setStatusFilter('')},
    visaFilter && {label:`Sponsorship: ${pretty(visaFilter)}`,clear:()=>setVisaFilter('')},
    authorizationFilter && {label:`Work authorization: ${pretty(authorizationFilter)}`,clear:()=>setAuthorizationFilter('')},
    eligibilityFilter && {label:`Campus fit: ${pretty(eligibilityFilter)}`,clear:()=>setEligibilityFilter('')},
    minimumSalary && {label:`Minimum compensation: ${minimumSalary}`,clear:()=>setMinimumSalary('')},
    postedAfter && {label:`Posted after: ${postedAfter}`,clear:()=>setPostedAfter('')},
    deadlineBefore && {label:`Deadline by: ${deadlineBefore}`,clear:()=>setDeadlineBefore('')},
    savedOnly && {label:'Saved only',clear:()=>setSavedOnly(false)},
  ].filter(Boolean) as {label:string;clear:()=>void}[];
  const results = useMemo(() => {
    const filtered = [...(props.searchData?.results || [])].filter(job => {
      if (savedOnly && !props.saved.some(saved => saved.id === job.id)) return false;
      if (companyFilter && !job.company.toLowerCase().includes(companyFilter.toLowerCase())) return false;
      if (locationFilter && job.location && !job.location.toLowerCase().includes(locationFilter.toLowerCase())) return false;
      if (skillFilter && ![...job.requiredSkills,...job.preferredSkills].some(skill=>skill.toLowerCase().includes(skillFilter.toLowerCase()))) return false;
      if (experienceFilter && job.experienceLevel && !job.experienceLevel.toLowerCase().includes(experienceFilter.toLowerCase())) return false;
      if (typeFilter && job.employmentType !== typeFilter) return false;
      if (arrangementFilter && job.workArrangement && job.workArrangement !== arrangementFilter) return false;
      if (statusFilter && job.listingStatus !== statusFilter) return false;
      if (visaFilter && job.visaSponsorship !== visaFilter) return false;
      if (authorizationFilter) {
        const authFactor=job.matchBreakdown.find(item=>item.label==='Work authorization');
        if (authorizationFilter==='confirmed' && authFactor?.status!=='matched') return false;
        if (authorizationFilter==='unknown' && authFactor?.status!=='unknown') return false;
        if (authorizationFilter==='mismatch' && authFactor?.status!=='mismatch') return false;
      }
      if (minimumSalary && job.salaryMax != null && job.salaryCurrency===props.profile.minimumCompensationCurrency && job.payPeriod===props.profile.minimumCompensationPeriod && job.salaryMax < Number(minimumSalary)) return false;
      const campusFactors=job.matchBreakdown.filter(item=>['Education','Branch / specialization','Graduation year'].includes(item.label));
      if (eligibilityFilter === 'unknown' && campusFactors.length>0 && !campusFactors.some(item=>item.status==='unknown')) return false;
      if (eligibilityFilter === 'mismatch' && !campusFactors.some(item=>item.status==='mismatch')) return false;
      if (postedAfter && job.postedAt && Date.parse(job.postedAt)<Date.parse(postedAfter)) return false;
      if (deadlineBefore && job.deadline && Date.parse(job.deadline)>Date.parse(deadlineBefore)) return false;
      return true;
    });
    const dateValue = (value?:string|null) => value && !Number.isNaN(Date.parse(value)) ? Date.parse(value) : null;
    filtered.sort((a,b) => {
      if (sortBy === 'recent') {
        const av=dateValue(a.postedAt),bv=dateValue(b.postedAt);
        return av===null?(bv===null?0:1):bv===null?-1:bv-av;
      }
      if (sortBy === 'deadline') {
        const av=dateValue(a.deadline),bv=dateValue(b.deadline);
        return av===null?(bv===null?0:1):bv===null?-1:av-bv;
      }
      if (sortBy === 'salary') {
        if (a.salaryMin == null || a.salaryCurrency == null || a.payPeriod == null) return b.salaryMin == null ? 0 : 1;
        if (b.salaryMin == null || b.salaryCurrency == null || b.payPeriod == null) return -1;
        if (a.salaryCurrency !== b.salaryCurrency || a.payPeriod !== b.payPeriod) return 0;
        return b.salaryMax! - a.salaryMax!;
      }
      return b.matchScore-a.matchScore;
    });
    return filtered;
  }, [props.searchData, props.saved, props.profile.minimumCompensationCurrency, props.profile.minimumCompensationPeriod, savedOnly, companyFilter, locationFilter, skillFilter, experienceFilter, typeFilter, arrangementFilter, statusFilter, visaFilter, authorizationFilter, eligibilityFilter, minimumSalary, postedAfter, deadlineBefore, sortBy]);
  return <>
    <div className="cp-page-head"><div><div className="cp-eyebrow">Live opportunity search</div><h1 className="cp-h1">Find your next move.</h1><p className="cp-subtitle">Real openings from company career pages and job portals, with eligibility evidence you can act on.</p></div><div className="cp-live"><ShieldCheck size={14} color="#329364"/>Evidence-backed listings</div></div>
    {props.status.isError && <div className="cp-alert error" data-testid="status-api-error"><AlertCircle size={16}/><span>We couldn't confirm live search availability. Search may still work; if it fails, try again once the service is reachable.</span></div>}
    {!props.status.isLoading && !props.status.isError && props.status.data && !props.status.data.configured && <div className="cp-alert warning" data-testid="status-not-configured"><Info size={16}/><span>{props.status.data.message || 'Live search is currently unavailable because the provider is not configured.'}</span></div>}
    {props.search.isError && <div className="cp-alert error" data-testid="search-error"><AlertCircle size={16}/><span>Search failed: {getErrorText(props.search.error)} <button className="cp-text-button" onClick={(e) => props.onSearch(e)} type="button">Retry search</button></span></div>}
    <form className="cp-card cp-search-panel" onSubmit={props.onSearch} data-testid="form-live-search">
      <div className="cp-search-row">
        <div className="cp-input-wrap"><Search className="cp-input-icon" size={16}/><input className="cp-input with-icon" value={props.query} onChange={e=>props.setQuery(e.target.value)} placeholder="Search roles, skills, or companies" aria-label="Search roles, skills, or companies" data-testid="input-search-query"/></div>
        <div className="cp-input-wrap"><MapPin className="cp-input-icon" size={15}/><input className="cp-input with-icon" value={props.location} onChange={e=>props.setLocation(e.target.value)} placeholder="Location or remote" aria-label="Location" data-testid="input-search-location"/></div>
        <select className="cp-select" value={props.opportunityType} onChange={e=>props.setOpportunityType(e.target.value as CareerSearchInput['opportunityType'])} aria-label="Opportunity type" data-testid="select-opportunity-type"><option value="both">Internships + jobs</option><option value="internship">Internships</option><option value="full-time">Full-time jobs</option></select>
        <button className="cp-search-btn" type="submit" disabled={props.search.isPending} data-testid="button-search">{props.search.isPending ? <><LoaderCircle size={15} className="spin"/>Searching</> : <><Search size={15}/>Search live</>}</button>
      </div>
      <div className="cp-search-options">
        <button type="button" onClick={()=>props.setFiltersOpen(!props.filtersOpen)} className="cp-button secondary" style={{height:31,padding:'0 10px',fontSize:11}} data-testid="button-search-filters"><Filter size={13}/>{props.filtersOpen?'Hide filters':'More filters'}<ChevronDown size={13}/></button>
        {props.profile.skills?.length ? <span className="cp-inline-note"><Target size={12}/> {props.profile.skills.length} preferred skills active in your profile</span> : <span className="cp-inline-note">Search across live source pages · no sample listings</span>}
      </div>
      {props.filtersOpen && <div className="cp-filter-grid">
        <label>Role / focus<input className="cp-input" value={props.role} onChange={e=>props.setRole(e.target.value)} placeholder="e.g. Product analyst" data-testid="input-search-role"/></label>
        <label>Company<input className="cp-input" value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)} placeholder="Filter company"/></label>
        <label>Location<input className="cp-input" value={locationFilter} onChange={e=>setLocationFilter(e.target.value)} placeholder="Filter location"/></label>
        <label>Skill in listing<input className="cp-input" value={skillFilter} onChange={e=>setSkillFilter(e.target.value)} placeholder="Filter by skill"/></label>
        <label>Experience<input className="cp-input" value={experienceFilter} onChange={e=>setExperienceFilter(e.target.value)} placeholder="e.g. Entry level"/></label>
        <label>Employment type<select className="cp-input" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="">All types</option><option value="internship">Internship</option><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option></select></label>
        <label>Work arrangement<select className="cp-input" value={arrangementFilter} onChange={e=>setArrangementFilter(e.target.value)}><option value="">Any arrangement</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></label>
        <label>Listing status<select className="cp-input" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="verified">Recently checked</option><option value="verification-needed">Needs verification</option><option value="possibly-expired">Possibly expired</option><option value="closed">Closed</option><option value="conflicting">Conflicting evidence</option></select></label>
        <label>Visa sponsorship<select className="cp-input" value={visaFilter} onChange={e=>setVisaFilter(e.target.value)}><option value="">Any / unknown</option><option value="offered">Explicitly offered</option><option value="unavailable">Explicitly unavailable</option><option value="not-specified">Not specified</option><option value="confirm">Requires confirmation</option></select></label>
        <label>Work authorization<select className="cp-input" value={authorizationFilter} onChange={e=>setAuthorizationFilter(e.target.value)}><option value="">All evidence</option><option value="confirmed">Potential match</option><option value="unknown">Unknown</option><option value="mismatch">Potential mismatch</option></select></label>
        <label>Campus eligibility<select className="cp-input" value={eligibilityFilter} onChange={e=>setEligibilityFilter(e.target.value)}><option value="">All evidence</option><option value="unknown">Needs confirmation</option><option value="mismatch">Potential mismatch</option></select></label>
        <label>Minimum compensation<input className="cp-input" type="number" min="0" value={minimumSalary} onChange={e=>setMinimumSalary(e.target.value)} placeholder="Any amount"/></label>
        <label>Posted on / after<input className="cp-input" type="date" value={postedAfter} onChange={e=>setPostedAfter(e.target.value)}/></label>
        <label>Deadline on / before<input className="cp-input" type="date" value={deadlineBefore} onChange={e=>setDeadlineBefore(e.target.value)}/></label>
        <div className="cp-filter-actions"><span>Pay is filtered only when currency and period match your profile; unknown values stay visible.</span><button type="button" className="cp-text-button" onClick={clearFilters}>Clear all filters</button></div>
      </div>}
    </form>
    {activeFilters.length>0 && <div className="cp-active-filters"><span>Active filters</span>{activeFilters.map((filter,index)=><button type="button" key={`${filter.label}-${index}`} onClick={filter.clear} title={`Remove ${filter.label}`}>{filter.label}<X size={11}/></button>)}<button type="button" className="cp-clear-filters" onClick={clearFilters}>Clear all</button></div>}
    {props.search.isPending ? <SearchLoading/> : props.searchData ? <>
      {props.searchData.warnings?.length > 0 && <div className="cp-alert warning" data-testid="search-warnings"><AlertCircle size={16}/><div>{props.searchData.warnings.map((warning,index)=><div key={index}>{warning}</div>)}</div></div>}
      {props.searchData.partialResults && <div className="cp-alert warning" data-testid="search-partial"><Info size={16}/><span>Partial results: some sources could not be reached. Openings below are from successful sources only.</span></div>}
      <div className="cp-metrics-grid">
        <div className="cp-card cp-metric"><span>Opportunities found</span><strong>{props.searchData.results.length}</strong><small>Returned by live sources</small></div>
        <div className="cp-card cp-metric"><span>Strong matches</span><strong>{props.searchData.results.filter(job=>job.matchScore>=70).length}</strong><small>70%+ on known preferences</small></div>
        <div className="cp-card cp-metric"><span>New since last scan</span><strong>{props.newSincePreviousScan===null?'—':props.newSincePreviousScan}</strong><small>{props.newSincePreviousScan===null?'First saved comparison':'Compared with last search'}</small></div>
        <div className="cp-card cp-metric"><span>Needs review</span><strong>{props.searchData.results.filter(job=>job.listingStatus!=='verified').length}</strong><small>Unknown, conflicting, or closed evidence</small></div>
      </div>
      <div className="cp-results-layout">
        <section>
          <div className="cp-section-head cp-results-toolbar"><h2>Openings from this search</h2><div className="cp-toolbar-actions">
            <label className="cp-filter-label"><input type="checkbox" checked={savedOnly} onChange={e=>setSavedOnly(e.target.checked)} data-testid="checkbox-saved-only"/>Saved only</label>
            <label className="cp-sort-label">Sort by<select className="cp-select cp-sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)} data-testid="select-sort-results"><option value="best">Best match</option><option value="recent">Most recent</option><option value="deadline">Deadline approaching</option><option value="salary">Highest comparable pay</option></select></label>
            <button type="button" className="cp-button secondary cp-refresh" onClick={props.onRefresh} disabled={props.search.isPending} data-testid="button-refresh-search">{props.search.isPending?<LoaderCircle className="spin" size={13}/>:<Activity size={13}/>}Refresh results</button>
            <span className="cp-meta">{results.length} of {props.searchData.results.length} · scanned {new Date(props.searchData.scannedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span>
          </div></div>
          {!results.length ? <div className="cp-card cp-empty"><div className="cp-empty-icon"><Search size={19}/></div><h3>{savedOnly?'No saved openings in these results':'No live openings matched this search'}</h3><p>{savedOnly?'Save an opening from your search results to collect it here.':'Try a broader title or location, or adjust your opportunity type. We only show openings returned by live sources.'}</p>{savedOnly && <button className="cp-button secondary" onClick={()=>setSavedOnly(false)} data-testid="button-clear-saved-filter">Show all results</button>}</div> : <div className="cp-job-list">{results.map(job=><JobCard key={job.id} job={job} saved={props.saved.some(item=>item.id===job.id)} onSave={()=>props.toggleSaved(job)} onOpen={()=>props.openJob(job)} onTrack={()=>props.addToTracker(job)}/>)}</div>}
        </section>
        <aside className="cp-results-aside">
          <div className="cp-card cp-side-card"><div className="cp-side-title">Source coverage <span className={props.searchData.partialResults?'cp-tag amber':'cp-tag green'}>{props.searchData.partialResults?'Partial':'Complete'}</span></div><div className="cp-side-row"><span>Sources checked</span><strong>{props.searchData.sourcesQueried}</strong></div><div className="cp-side-row"><span>Responded</span><strong>{props.searchData.successfulSources}</strong></div><div className="cp-side-row"><span>Unavailable</span><strong>{props.searchData.failedSources}</strong></div><div className="cp-side-row"><span>Last scan</span><strong>{new Date(props.searchData.scannedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</strong></div></div>
          <div className="cp-card cp-side-card"><div className="cp-side-title">Search process <Activity size={14} color="#8793a5"/></div>{props.searchData.stages.map((stage,index)=><div className="cp-side-row" key={`${stage.name}-${index}`}><span style={{display:'flex',gap:7,alignItems:'center'}}>{stage.completed?<CheckCircle2 size={13} color="#3ca16b"/>:<Clock3 size={13} color="#b1bac7"/>}{pretty(stage.name)}</span><strong style={{fontSize:10,color:stage.completed?'#329364':'#8994a4'}}>{stage.completed?'Complete':'Pending'}</strong></div>)}</div>
        </aside>
      </div>
    </> : <div className="cp-card cp-empty"><div className="cp-empty-icon"><Search size={19}/></div><h3>Your next opportunity starts with a search</h3><p>Search company career pages and job portals live. Each result includes a source link and a clear read on what matches your profile.</p><p style={{marginTop:8,fontSize:10}}>Use a specific title and location for the most relevant openings.</p></div>}
  </>;
}

function SearchLoading() { return <><div className="cp-alert success"><LoaderCircle size={15} className="spin"/><span>Live search is running. Vayora is searching source pages, reading listings, checking links, removing duplicates, and calculating matches.</span></div><div className="cp-results-layout"><div className="cp-job-list"><div className="cp-skeleton"/><div className="cp-skeleton"/><div className="cp-skeleton"/></div><aside className="cp-card cp-side-card"><div className="cp-side-title">What the scan checks</div><p className="cp-scan-note">Completed steps and source counts appear after TinyFish returns the actual search and page-fetch results.</p></aside></div></>; }

function JobCard({job,saved,onSave,onOpen,onTrack}:{job:JobListing;saved:boolean;onSave:()=>void;onOpen:()=>void;onTrack:()=>void}) {
  const statusClass = job.listingStatus === 'verified' ? 'green' : job.listingStatus === 'closed' || job.listingStatus === 'possibly-expired' ? 'amber' : '';
  const salary = money(job);
  return <article className="cp-card cp-job" onClick={onOpen} data-testid={`card-job-${job.id}`} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onOpen();}}>
    <div className="cp-job-top"><div className="cp-company-mark">{job.company.trim().slice(0,2).toUpperCase()}</div><div style={{minWidth:0}}><h3 className="cp-job-title">{job.title}</h3><div className="cp-company">{job.company} <span style={{color:'#bdc4cf'}}>·</span> {job.sourceName}</div></div><div className="cp-job-actions">
      <button className={`cp-icon-btn ${saved?'saved':''}`} type="button" aria-label={saved?'Remove saved opening':'Save opening'} title={saved?'Remove saved opening':'Save opening'} onClick={e=>{e.stopPropagation();onSave();}} data-testid={`button-save-${job.id}`}><Bookmark size={15} fill={saved?'currentColor':'none'}/></button>
      <button className="cp-icon-btn" type="button" aria-label="Add to application tracker" title="Add to tracker" onClick={e=>{e.stopPropagation();onTrack();}} data-testid={`button-track-${job.id}`}><ArrowDownRight size={16}/></button>
    </div></div>
    <div className="cp-job-facts"><span className="cp-fact"><MapPin size={13}/>{job.location || 'Location not specified'}</span>{job.workArrangement && <span className="cp-fact"><Building2 size={13}/>{pretty(job.workArrangement)}</span>}<span className="cp-fact"><BriefcaseBusiness size={13}/>{pretty(job.employmentType)}</span>{salary && <span className="cp-fact"><Wallet size={13}/>{salary}</span>}{job.deadline && <span className="cp-fact"><Clock3 size={13}/>Deadline {shortDate(job.deadline)}</span>}</div>
    <div className="cp-job-bottom"><div className="cp-tags"><span className={`cp-tag ${statusClass}`}>{pretty(job.listingStatus)}</span>{job.experienceLevel && <span className="cp-tag">{job.experienceLevel}</span>}{job.requiredSkills.slice(0,3).map(skill=><span className="cp-tag" key={skill}>{skill}</span>)}</div><div className="cp-match"><span className="cp-match-bar"><span style={{width:`${Math.max(0,Math.min(100,job.matchScore))}%`}}/></span>{job.matchScore}% match</div></div>
    <div className="cp-job-footer"><span>{job.postedAt?`Posted ${shortDate(job.postedAt)}`:'Posting date not specified'}</span><a className="cp-job-apply" href={job.applicationUrl||job.canonicalUrl} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>{job.applicationUrl?'Apply on source':'Open source listing'}<ExternalLink size={12}/></a><button type="button" className="cp-text-button" onClick={e=>{e.stopPropagation();onOpen();}}>View details</button></div>
    {job.verificationNote && <div style={{margin:'10px 0 0 50px',fontSize:10,color:'#8792a3',lineHeight:1.4}}><ShieldCheck size={12} style={{display:'inline',verticalAlign:'-2px',marginRight:5,color:'#3da471'}}/>{job.verificationNote}</div>}
  </article>;
}

function SavedPage({jobs,toggleSaved,openJob,addToTracker}:{jobs:JobListing[];toggleSaved:(j:JobListing)=>void;openJob:(j:JobListing)=>void;addToTracker:(j:JobListing)=>void}) {
  return <><PageHeading eyebrow="Your shortlist" title="Saved jobs" subtitle="Openings you've kept for a closer look. Stored only in this browser."/><div className="cp-section-head"><h2>Saved openings</h2><span className="cp-meta">{jobs.length} {jobs.length===1?'opening':'openings'}</span></div>{jobs.length?<div className="cp-job-list">{jobs.map(job=><JobCard key={job.id} job={job} saved onSave={()=>toggleSaved(job)} onOpen={()=>openJob(job)} onTrack={()=>addToTracker(job)}/>)}</div>:<div className="cp-card cp-empty"><div className="cp-empty-icon"><Bookmark size={18}/></div><h3>Keep promising openings close</h3><p>Save jobs from Discover and they’ll appear here. Your shortlist remains on this device and browser only.</p><Link href="/" className="cp-button" style={{marginTop:16}} data-testid="link-find-jobs"><Search size={14}/>Find live jobs</Link></div>}</>;
}

function TrackerPage({items,setTracker,openJob,openStudio}:{items:TrackerItem[];setTracker:React.Dispatch<React.SetStateAction<TrackerItem[]>>;openJob:(j:JobListing)=>void;openStudio:(j:JobListing)=>void}) {
  const [filterText,setFilterText]=useState('');
  const [stageFilter,setStageFilter]=useState('');
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60_000);return()=>window.clearInterval(timer);},[]);
  const visibleItems=items.filter(item=>
    (!stageFilter||item.stage===stageFilter)&&
    (!filterText||`${item.job.title} ${item.job.company} ${item.job.location||''}`.toLowerCase().includes(filterText.toLowerCase())),
  );
  const grouped = stages.map(stage=>({stage,items:visibleItems.filter(item=>item.stage===stage)}));
  const update=(id:string,patch:Partial<TrackerItem>)=>setTracker(prev=>prev.map(item=>item.job.id===id?{...item,...patch,updatedAt:new Date().toISOString()}:item));
  return <><PageHeading eyebrow="Your application pipeline" title="Application tracker" subtitle="Record dates, notes, and reminders for every opportunity. This tracker is stored in your browser."/><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><div className="cp-section-head" style={{margin:0}}><h2>Pipeline</h2></div><span className="cp-meta">{items.length} tracked {items.length===1?'opening':'openings'} · Local only</span></div>
    {!items.length?<div className="cp-card cp-empty"><div className="cp-empty-icon"><LayoutDashboard size={18}/></div><h3>Your application pipeline is clear</h3><p>Add an opening from search results to start tracking it through your next steps.</p><Link href="/" className="cp-button" style={{marginTop:16}}><Search size={14}/>Discover openings</Link></div>:<>
      <div className="cp-tracker-controls"><input aria-label="Search tracked applications" className="cp-input" value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Search roles, companies, or locations"/><select aria-label="Filter tracker by stage" className="cp-select" value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="">All stages</option>{stages.map(stage=><option key={stage}>{stage}</option>)}</select></div>
      {visibleItems.some(item=>item.outreachFollowUpAt) && <section className="cp-card career-panel"><h2>Outreach follow-ups</h2>{visibleItems.filter(item=>item.outreachFollowUpAt).map(item=>{const due=Date.parse(`${item.outreachFollowUpAt}T00:00:00`)<=now;return <div className="career-save-row" key={item.job.id}><span><strong>{item.job.title} · {item.job.company}</strong> — {due?'Follow-up due':'Follow-up scheduled'} {shortDate(item.outreachFollowUpAt)}</span><button className="cp-text-button" type="button" onClick={()=>openStudio(item.job)}>Open outreach draft</button></div>;})}</section>}
      {!visibleItems.length?<div className="cp-card cp-empty"><h3>No tracked applications match</h3><p>Clear the search or stage filter to see your full pipeline.</p></div>:<div className="cp-stage-grid">{grouped.map(({stage,items:stageItems})=><section key={stage} className="cp-card cp-stage"><div className="cp-stage-heading"><strong>{stage}</strong><span className="cp-stage-count">{stageItems.length}</span></div>{stageItems.map(item=>{const reminderDue=!!item.reminderAt&&Date.parse(item.reminderAt)<=now;return <div key={item.job.id} className="cp-stage-item"><strong style={{cursor:'pointer'}} onClick={()=>openJob(item.job)}>{item.job.title}</strong><span>{item.job.company}</span>{(item.resumeVersionId||item.emailDraftId)&&<span className="cp-tag green">Resume and email linked</span>}{item.outreachDraftId&&<span className="cp-tag">Outreach: {pretty(item.outreachStatus)}</span>}{item.jobAnalysis&&<details className="career-job-description"><summary>View linked job analysis</summary><p>{item.jobAnalysis}</p></details>}<select aria-label={`Move ${item.job.title} stage`} value={item.stage} onChange={e=>{const nextStage=e.target.value;update(item.job.id,{stage:nextStage,applicationDate:nextStage==='Applied'&&!item.applicationDate?new Date().toISOString().slice(0,10):item.applicationDate});}} data-testid={`select-stage-${item.job.id}`}>{stages.map(s=><option key={s}>{s}</option>)}</select><label className="cp-tracker-field">Application date<input type="date" value={item.applicationDate||''} onChange={e=>update(item.job.id,{applicationDate:e.target.value||null})}/></label><label className="cp-tracker-field">Reminder<input type="datetime-local" value={item.reminderAt||''} onChange={e=>update(item.job.id,{reminderAt:e.target.value||null})}/></label>{item.reminderAt&&<span className={`cp-reminder ${reminderDue?'due':''}`}><Clock3 size={12}/>{reminderDue?'Reminder due':'Reminder set'} · {new Date(item.reminderAt).toLocaleString()}</span>}<label className="cp-tracker-field">Notes<textarea rows={2} value={item.notes||''} onChange={e=>update(item.job.id,{notes:e.target.value})} placeholder="Add a personal note or next step"/></label><div className="cp-tracker-actions"><a href={item.job.applicationUrl||item.job.canonicalUrl} target="_blank" rel="noreferrer">Open listing <ExternalLink size={11}/></a><button className="cp-text-button" type="button" onClick={()=>openStudio(item.job)}>Application kit</button><button className="cp-text-button" type="button" onClick={()=>setTracker(prev=>prev.filter(row=>row.job.id!==item.job.id))} data-testid={`button-remove-tracker-${item.job.id}`}><Trash2 size={12}/>Remove</button></div></div>})}</section>)}</div>}
    </>}
  </>;
}

function Preferences({profile,setProfile,onSearch}:{profile:CareerSearchInput;setProfile:(p:CareerSearchInput)=>void;onSearch:(p:CareerSearchInput)=>void}) {
  const [draft,setDraft]=useState<CareerSearchInput>(profile);
  const [saved,setSaved]=useState(false);
  const update=<K extends keyof CareerSearchInput>(key:K,value:CareerSearchInput[K])=>setDraft(prev=>({...prev,[key]:value}));
  const save=()=>{setProfile({...draft,query:draft.query||draft.role||''});setSaved(true);window.setTimeout(()=>setSaved(false),2200);};
  return <><PageHeading eyebrow="Personalize your search" title="Search preferences" subtitle="Use your real profile details to sharpen evidence-based fit notes. Saved locally in this browser."/><div className="cp-preference-grid">
    <section className="cp-card cp-form-card"><h2>What you're looking for</h2><p>Set the direction for your next live search.</p><Field label="Target role"><input value={draft.role||''} onChange={e=>update('role',e.target.value)} placeholder="e.g. Business analyst" data-testid="input-preference-role"/></Field><Field label="Search phrase"><input value={draft.query||''} onChange={e=>update('query',e.target.value)} placeholder="e.g. junior data analyst SQL" data-testid="input-preference-query"/></Field><Field label="Preferred location"><input value={draft.location||''} onChange={e=>update('location',e.target.value)} placeholder="City, region, or remote" data-testid="input-preference-location"/></Field><Field label="Opportunity type"><select value={draft.opportunityType} onChange={e=>update('opportunityType',e.target.value as CareerSearchInput['opportunityType'])} data-testid="select-preference-type"><option value="both">Internships and full-time roles</option><option value="internship">Internships</option><option value="full-time">Full-time roles</option></select></Field><Field label="Experience level"><input value={draft.experienceLevel||''} onChange={e=>update('experienceLevel',e.target.value)} placeholder="e.g. Entry level" data-testid="input-preference-experience"/></Field></section>
      <section className="cp-card cp-form-card"><h2>Eligibility context</h2><p>Clear details help surface requirements and unknowns.</p><Field label="Skills (comma separated)"><textarea value={(draft.skills||[]).join(', ')} onChange={e=>update('skills',e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} placeholder="SQL, Excel, Python" data-testid="input-preference-skills"/></Field><Field label="Degree"><input value={draft.degree||''} onChange={e=>update('degree',e.target.value)} placeholder="e.g. B.S. Computer Science" data-testid="input-preference-degree"/></Field><Field label="Branch or specialization"><input value={draft.branch||''} onChange={e=>update('branch',e.target.value)} placeholder="e.g. Information Systems" data-testid="input-preference-branch"/></Field><Field label="Graduation year"><input type="number" value={draft.graduationYear||''} onChange={e=>update('graduationYear',e.target.value?Number(e.target.value):null)} placeholder="2026" data-testid="input-preference-grad-year"/></Field><Field label="Target companies (comma separated)"><input value={(draft.targetCompanies||[]).join(', ')} onChange={e=>update('targetCompanies',e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} placeholder="Companies to include" data-testid="input-preference-companies"/></Field><Field label="Preferred industries (comma separated)"><input value={(draft.preferredIndustries||[]).join(', ')} onChange={e=>update('preferredIndustries',e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} placeholder="e.g. Climate, healthcare, fintech"/></Field><Field label="Work authorization context"><input value={draft.workAuthorization||''} onChange={e=>update('workAuthorization',e.target.value)} placeholder="e.g. Authorized to work in India"/><small className="cp-help-text">Compared only with explicit information found in a live listing.</small></Field></section>
      <section className="cp-card cp-form-card"><h2>Work and compensation</h2><p>Keep your search aligned with your constraints.</p><Field label="Work arrangement"><select value={draft.workArrangement||''} onChange={e=>update('workArrangement',(e.target.value||null) as CareerSearchInput['workArrangement'])} data-testid="select-preference-arrangement"><option value="">Any arrangement</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></Field><Field label="Minimum compensation amount"><input type="number" min="0" value={draft.minimumCompensation||''} onChange={e=>update('minimumCompensation',e.target.value?Number(e.target.value):null)} placeholder="No minimum" data-testid="input-preference-compensation"/></Field><div className="cp-two-fields"><Field label="Currency"><select value={draft.minimumCompensationCurrency||''} onChange={e=>update('minimumCompensationCurrency',e.target.value||null)}><option value="">Choose currency</option><option value="INR">INR · Indian rupee</option><option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · Pound sterling</option><option value="CAD">CAD · Canadian dollar</option><option value="AUD">AUD · Australian dollar</option><option value="SGD">SGD · Singapore dollar</option><option value="OTHER">Other</option></select></Field><Field label="Pay period"><select value={draft.minimumCompensationPeriod||''} onChange={e=>update('minimumCompensationPeriod',(e.target.value||null) as CareerSearchInput['minimumCompensationPeriod'])}><option value="">Choose period</option><option value="hourly">Hourly</option><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="total">Total / stipend</option></select></Field></div><Field label="Visa sponsorship"><select value={draft.visaSponsorship||''} onChange={e=>update('visaSponsorship',(e.target.value||null) as CareerSearchInput['visaSponsorship'])} data-testid="select-preference-visa"><option value="">No preference</option><option value="offered">Sponsorship offered</option><option value="not-offered">Sponsorship not offered</option><option value="any">Any / not specified</option></select></Field><div className="cp-source-state"><Info size={15}/>Compensation is compared only when currency and pay period match. Eligibility details come from live listing text; unknowns stay unknown, and preferences don't guarantee eligibility.</div></section>
    <section className="cp-card cp-form-card" style={{display:'flex',flexDirection:'column',justifyContent:'space-between'}}><div><h2>Profile use</h2><p>Your details are used to shape searches and compare visible requirements.</p><div className="cp-setting-row"><div><strong>Stored on this browser</strong><span>Preferences, saved openings, and tracker entries are stored in local browser storage only.</span></div><ShieldCheck size={20} color="#379566"/></div><div className="cp-setting-row"><div><strong>No account sync in v1</strong><span>There is no cross-device sync. Clearing browser data removes this information.</span></div><CircleHelp size={18} color="#8491a4"/></div></div><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:20}}><button className="cp-button secondary" type="button" onClick={()=>setDraft(profile)} data-testid="button-reset-preferences">Discard changes</button><button className="cp-button" type="button" onClick={save} data-testid="button-save-preferences">{saved?<><Check size={14}/>Saved locally</>:'Save preferences'}</button><button className="cp-button subtle" type="button" onClick={()=>{save();onSearch(draft);}} data-testid="button-search-profile"><Search size={14}/>Apply profile to Discover</button></div></section>
  </div></>;
}

function Field({label,children}:{label:string;children:ReactNode}) { return <div className="cp-field"><label>{label}</label>{children}</div>; }
function PageHeading({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle:string}) {return <div className="cp-page-head"><div><div className="cp-eyebrow">{eyebrow}</div><h1 className="cp-h1">{title}</h1><p className="cp-subtitle">{subtitle}</p></div></div>;}

function Settings({savedCount,trackerCount,clearData}:{savedCount:number;trackerCount:number;clearData:()=>void}) {
  const [confirm,setConfirm]=useState(false);
  return <><PageHeading eyebrow="Account and privacy" title="Settings" subtitle="Understand what Vayora checks, stores, and leaves in your control."/><section className="cp-card cp-form-card" style={{marginBottom:15}}><h2>Live search and verification</h2><p>Vayora checks real sources for the current search. Results can be incomplete when source pages are unavailable.</p><div className="cp-setting-row"><div><strong>Evidence before confidence</strong><span>Listing status, source details, and eligibility breakdowns reflect available listing evidence. They are guidance, not a promise that an employer will accept an application.</span></div><ShieldCheck size={20} color="#379566"/></div><div className="cp-setting-row"><div><strong>Re-check when you need to</strong><span>Use “Check listing again” in a job detail panel to re-check listing status and application link reachability.</span></div><Activity size={19} color="#687da9"/></div><div className="cp-setting-row"><div><strong>Sources may return partial results</strong><span>Unavailable sources are disclosed in search warnings and source coverage; Vayora does not fill gaps with sample jobs.</span></div><Info size={18} color="#a67b2c"/></div></section><section className="cp-card cp-form-card"><h2>Local browser data</h2><p>Your Vayora profile and application materials are stored in this browser only. They are not account-synced or uploaded to Vayora.</p><div className="cp-setting-row"><div><strong>Saved openings</strong><span>Stored in this browser only. Current count: {savedCount}.</span></div><Bookmark size={18} color="#687da9"/></div><div className="cp-setting-row"><div><strong>Application tracker</strong><span>Stage updates, linked resume/email versions, and outreach records are stored in this browser only. Current count: {trackerCount}.</span></div><LayoutDashboard size={18} color="#687da9"/></div><div className="cp-setting-row"><div><strong>Master Profile and application materials</strong><span>Contact details, projects, resume versions, email drafts, and outreach drafts remain local to this browser. Export or copy them before clearing browser data.</span></div><UserRound size={18} color="#687da9"/></div><div><strong>Search preferences</strong><span>Search criteria and profile fields persist in local browser storage. No cross-device syncing in v1.</span></div><div style={{display:'flex',justifyContent:'flex-end',marginTop:17}}>{confirm?<div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:11,color:'#8a5260'}}>Remove all local Vayora data?</span><button className="cp-button danger" onClick={()=>{clearData();setConfirm(false)}} data-testid="button-confirm-clear">Clear local data</button><button className="cp-button secondary" onClick={()=>setConfirm(false)} data-testid="button-cancel-clear">Cancel</button></div>:<button className="cp-button danger" onClick={()=>setConfirm(true)} data-testid="button-clear-data"><Trash2 size={14}/>Clear local data</button>}</div></section></>;
}

function JobDetail({job,close,saved,toggleSaved,addToTracker,prepareApplication,verify,verifying,verification}:{job:JobListing;close:()=>void;saved:boolean;toggleSaved:()=>void;addToTracker:()=>void;prepareApplication:()=>void;verify:()=>void;verifying:boolean;verification?:{explanation:string;evidence:string;checkedAt:string;confidence:number;listingStatus:string;applicationUrlReachable:boolean|null}}) {
  const breakdown=job.matchBreakdown||[];
  return <div className="cp-detail-backdrop" onClick={close} role="presentation"><aside className="cp-detail" onClick={e=>e.stopPropagation()} aria-label={`${job.title} at ${job.company}`}><header className="cp-detail-head"><button type="button" className="cp-button secondary" style={{height:31,padding:'0 9px'}} onClick={close} data-testid="button-close-detail"><X size={14}/>Close</button><div style={{display:'flex',gap:7}}><button className={`cp-icon-btn ${saved?'saved':''}`} onClick={toggleSaved} aria-label={saved?'Unsave opening':'Save opening'} data-testid="button-detail-save"><Bookmark size={15} fill={saved?'currentColor':'none'}/></button><button className="cp-button secondary" style={{height:32}} onClick={prepareApplication}><FileText size={14}/>Prepare application</button><button className="cp-button" style={{height:32}} onClick={addToTracker} data-testid="button-detail-track"><ArrowDownRight size={14}/>Track</button></div></header>
    <div className="cp-detail-body"><div className="cp-detail-summary"><div style={{display:'flex',justifyContent:'space-between',gap:10}}><div><div className="cp-eyebrow">{job.sourceName}</div><h2>{job.title}</h2><p>{job.company} {job.location?`· ${job.location}`:''}</p></div><div className="cp-company-mark" style={{width:44,height:44}}>{job.company.slice(0,2).toUpperCase()}</div></div><div className="cp-tags" style={{margin:'2px 0 15px'}}><span className={`cp-tag ${job.listingStatus==='verified'?'green':'amber'}`}><ShieldCheck size={11} style={{display:'inline',verticalAlign:'-2px',marginRight:3}}/>{pretty(job.listingStatus)}</span><span className="cp-tag">{pretty(job.employmentType)}</span>{job.workArrangement&&<span className="cp-tag">{pretty(job.workArrangement)}</span>}{job.experienceLevel&&<span className="cp-tag">{job.experienceLevel}</span>}</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a className="cp-button" href={job.applicationUrl||job.canonicalUrl} target="_blank" rel="noreferrer" data-testid="link-apply-job"><ExternalLink size={14}/>{job.applicationUrl?'Apply on source':'Open source listing'}</a><button className="cp-button secondary" onClick={verify} disabled={verifying} data-testid="button-verify-job">{verifying?<LoaderCircle size={14} className="spin"/>:<ShieldCheck size={14}/>}Check listing again</button></div><p className="cp-inline-note" style={{marginTop:9}}>A deeper TinyFish Agent check may use your TinyFish account credits.</p></div>
      <div className="cp-detail-section"><h3>Match to your profile · {job.matchScore}%</h3><p>{job.matchExplanation}</p>{breakdown.map((factor,i)=><div key={`${factor.label}-${i}`} className="cp-match-factor"><span className={`cp-factor-dot ${factor.status==='unknown'?'unknown':factor.status==='mismatch'?'mismatch':''}`}/><span><strong style={{color:'#46536a'}}>{factor.label}</strong> · {factor.explanation}</span><span style={{marginLeft:'auto',whiteSpace:'nowrap',color:'#8a95a4'}}>{factor.points>0?'+':''}{factor.points}</span></div>)}</div>
      <div className="cp-detail-section"><h3>Listing evidence</h3><p>{job.verificationNote}</p><p style={{marginTop:7}}>Last checked: {new Date(job.lastCheckedAt).toLocaleString()} · Confidence {Math.round(job.verificationConfidence*100)}%</p>{verification&&<div className="cp-alert success" style={{marginTop:11,marginBottom:0}}><CheckCircle2 size={15}/><span><strong>Checked {new Date(verification.checkedAt).toLocaleString()}</strong><br/>{verification.explanation}<br/><span style={{opacity:.85}}>Evidence: {verification.evidence} · Application link {verification.applicationUrlReachable===null?'not confirmed':verification.applicationUrlReachable?'reachable':'not reachable'} · Confidence {Math.round(verification.confidence*100)}%</span></span></div>}</div>
      {(job.requiredSkills.length>0||job.preferredSkills.length>0)&&<div className="cp-detail-section"><h3>Skills</h3>{job.requiredSkills.length>0&&<p><strong>Required</strong><br/>{job.requiredSkills.join(' · ')}</p>}{job.preferredSkills.length>0&&<p style={{marginTop:7}}><strong>Preferred</strong><br/>{job.preferredSkills.join(' · ')}</p>}</div>}
      <div className="cp-detail-section"><h3>Eligibility details</h3><p><strong>Education:</strong> {job.educationRequirements||'Not specified in the listing'}</p><p style={{marginTop:5}}><strong>Graduation year:</strong> {job.graduationYearRequirements||'Not specified in the listing'}</p><p style={{marginTop:5}}><strong>Work authorization:</strong> {job.workAuthorization||'Not specified'}</p><p style={{marginTop:5}}><strong>Visa sponsorship:</strong> {pretty(job.visaSponsorship)}</p></div>
      <div className="cp-detail-section"><h3>Compensation and timing</h3><p>{money(job)||'Compensation not listed'}{job.postedAt?` · Posted ${shortDate(job.postedAt)}`:''}{job.deadline?` · Apply by ${shortDate(job.deadline)}`:''}</p></div>
      {job.description&&<details className="cp-detail-section cp-description"><summary>Full job description</summary><p style={{whiteSpace:'pre-line'}}>{job.description}</p></details>}
      <div className="cp-detail-section"><h3>Source</h3><p>Found on {job.sourceName}. <a href={job.sourceUrl} target="_blank" rel="noreferrer" style={{color:'#315de2',fontWeight:650}}>View source listing <ExternalLink size={11} style={{display:'inline',verticalAlign:'-1px'}}/></a></p>{job.alternativeSources.length>0&&<p style={{marginTop:7}}>Also listed at: {job.alternativeSources.join(', ')}</p>}</div>
    </div></aside></div>;
}
function getErrorText(error:unknown) { if(error instanceof Error)return error.message; if(typeof error==='object'&&error&&'error'in error)return String((error as {error:unknown}).error);return 'The live search service returned an unexpected error.'; }

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppShell />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
