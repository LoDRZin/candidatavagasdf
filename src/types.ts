export type Experience = {
  id: string;
  role: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string[];
};

export type Education = {
  id: string;
  course: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  status: string;
};

export type Project = {
  id: string;
  title: string;
  description: string;
  link: string;
};

export type Certification = {
  id: string;
  name: string;
  issuer: string;
  date: string;
};

export type ResumeData = {
  accentColor?: string;
  profile: {
    name: string;
    headline: string;
    email: string;
    phone: string;
    location: string;
    website: string;
  };
  summary: string;
  experiences: Experience[];
  education: Education[];
  projects: Project[];
  certifications: Certification[];
  skills: string[];
  languages: string[];
};

export type TemplateId = string;

export type ResumeTemplate = {
  id: TemplateId;
  name: string;
  category: string;
  description: string;
  html: string;
  css: string;
  family?: string;
  categoryKey?: string;
};

export type SavedDraft = {
  templateId: TemplateId;
  data: ResumeData;
  updatedAt: string;
};

export type SavedResumeVersion = SavedDraft & {
  id: string;
  label: string;
};
