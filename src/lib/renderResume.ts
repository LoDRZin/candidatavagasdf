import type { Education, Experience, ResumeData, ResumeTemplate } from "../types";

function formatMonth(value: string): string {
  if (!value) return "";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
  return `${label}/${year}`;
}

function withDateRange<T extends Experience | Education>(item: T) {
  const from = formatMonth(item.startDate);
  const to = "current" in item && item.current ? "Atual" : formatMonth(item.endDate);
  return { ...item, dateRange: from && to ? `${from} — ${to}` : from || to };
}

function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => {
    if (value && typeof value === "object" && part in value) {
      return (value as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

function renderNode(element: Element, context: unknown): void {
  const repeatPath = element.getAttribute("data-repeat");
  if (repeatPath) {
    const items = getPath(context, repeatPath);
    const prototype = element.querySelector<HTMLTemplateElement>(":scope > template[data-item]");
    if (!prototype || !Array.isArray(items)) {
      element.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const clone = prototype.content.firstElementChild?.cloneNode(true);
      if (clone instanceof Element) {
        renderNode(clone, item);
        fragment.append(clone);
      }
    }
    element.replaceChildren(fragment);
    return;
  }

  const fieldPath = element.getAttribute("data-field");
  if (fieldPath) {
    const value = getPath(context, fieldPath);
    element.textContent = typeof value === "string" ? value : "";
  } else if (element.hasAttribute("data-text")) {
    element.textContent = typeof context === "string" ? context : "";
  }

  const listPath = element.getAttribute("data-list");
  if (listPath) {
    const value = getPath(context, listPath);
    element.textContent = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").join(" · ")
      : "";
  }

  for (const child of Array.from(element.children)) renderNode(child, context);
}

export function renderResumeMarkup(template: ResumeTemplate, data: ResumeData): string {
  const parsed = new DOMParser().parseFromString(template.html, "text/html");
  const resume = parsed.body.firstElementChild;
  if (!resume) return "";

  const context = {
    ...data,
    profile: { ...data.profile, initials: data.profile.name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toLocaleUpperCase('pt-BR')).join('') },
    experiences: data.experiences.map(withDateRange),
    education: data.education.map(withDateRange),
    certifications: (data.certifications ?? []).map((item) => ({ ...item, dateLabel: formatMonth(item.date) })),
    projects: data.projects ?? [],
  };
  renderNode(resume, context);

  for (const section of Array.from(resume.querySelectorAll<HTMLElement>("[data-section]"))) {
    const hasContent = Array.from(section.querySelectorAll("[data-field], [data-text], [data-list]"))
      .some((node) => (node.textContent ?? "").trim().length > 0);
    section.hidden = !hasContent;
  }

  return resume.outerHTML;
}

export function resumeCompleteness(data: ResumeData): number {
  const checks = [
    data.profile.name.trim(),
    data.profile.headline.trim(),
    data.profile.email.trim() || data.profile.phone.trim(),
    data.summary.trim(),
    data.experiences.length > 0 || data.projects.length > 0,
    data.education.length > 0,
    data.skills.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
