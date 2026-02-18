import type { GenericOAuthConnectionProps } from "./generic-oauth-connection";

/* ------------------------------------------------------------------ */
/*  SVG brand icons (h-5 w-5 to match existing connection components) */
/* ------------------------------------------------------------------ */

function LinearIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path
        d="M1.22541 61.5228c-.97027-1.3341-.18498-3.1801 1.35885-3.1801h40.1271c.9449 0 1.7105.7656 1.7105 1.7106v40.127c0 1.5439-1.8459 2.3292-3.1801 1.3589L1.22541 61.5228ZM18.9998 43.4285C18.7991 20.1457 37.6061 1.04822 60.8885.57129c.7536-.01547 1.3765.59778 1.3765 1.35156V43.077c0 .7493-.6074 1.3567-1.3567 1.3567H19.3571c-.1862 0-.357-.1512-.3573-.0052Z"
        fill="currentColor"
      />
      <path
        d="M99.546 56.5959C95.0476 79.4435 75.3909 96.4702 51.5525 98.2665c-.7556.0571-1.3857-.5496-1.3857-1.3076V60.8067c0-.7244.5693-1.3204 1.2929-1.3572l46.7412-2.2077c.749-.0354 1.3809.5723 1.3451 1.3541Z"
        fill="currentColor"
      />
    </svg>
  );
}

function NotionIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path
        d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z"
        fill="currentColor"
      />
      <path
        d="M61.35.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723.967 5.053 3.3 8.167l13.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113L88.723 96.08c5.437-.387 6.99-2.917 6.99-7.193V17.64c0-2.207-.853-2.89-3.3-4.723L74.75 1.14C71.11-1.687 69.317-.537 61.35.227z"
        fill="#fff"
      />
      <path
        d="M27.133 17.507c-5.247.353-6.437.433-9.417-1.99L8.88 8.86c-1.167-.967-.583-2.14 1.167-2.333l52.833-3.887c4.467-.387 6.8 1.167 8.543 2.527l10.277 7.393c.39.193.97 1.36.193 1.36l-54.373 3.393-.387.193z"
        fill="currentColor"
      />
      <path d="M19.333 88.3V29.947c0-2.527.773-3.697 3.113-3.893L86.2 22.36c2.14-.193 3.107 1.167 3.107 3.693V84.42c0 2.527-.387 4.667-3.883 4.86l-59.9 3.497c-3.497.193-5.19-.967-5.19-4.477h-1z" fill="#fff" />
      <path
        d="M67.233 33.84c.39 1.75 0 3.497-1.75 3.693l-2.917.577v44.147c-2.527 1.36-4.857 2.14-6.797 2.14-3.113 0-3.883-.967-6.22-3.887l-19.03-29.94v28.967l6.027 1.36s0 3.497-4.857 3.497l-13.393.773c-.387-.773 0-2.723 1.357-3.11l3.497-.967V36.757l-4.857-.387c-.39-1.75.583-4.277 3.3-4.47l14.367-.967 19.8 30.327V34.42l-5.053-.58c-.39-2.143 1.163-3.693 3.103-3.887l13.42-.113z"
        fill="currentColor"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function AsanaIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.78 12.653c-2.882 0-5.22 2.337-5.22 5.218 0 2.882 2.338 5.22 5.22 5.22 2.881 0 5.22-2.338 5.22-5.22 0-2.881-2.339-5.218-5.22-5.218zm-13.56 0c-2.882 0-5.22 2.337-5.22 5.218C0 20.753 2.338 23.091 5.22 23.091c2.881 0 5.22-2.338 5.22-5.22 0-2.881-2.339-5.218-5.22-5.218zM17.281 5.218c0 2.882-2.339 5.22-5.22 5.22-2.882 0-5.22-2.338-5.22-5.22C6.841 2.338 9.179 0 12.061 0c2.881 0 5.22 2.338 5.22 5.218z" />
    </svg>
  );
}

function JiraIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24.013 12.487V1.005A1.005 1.005 0 0 0 23.013 0z" />
    </svg>
  );
}

function AirtableIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.52 1.305L2.108 4.903c-.394.15-.394.694 0 .846L11.52 9.34a1.319 1.319 0 0 0 .96 0l9.412-3.591c.394-.152.394-.695 0-.846L12.48 1.305a1.319 1.319 0 0 0-.96 0z" />
      <path d="M12.753 11.19v10.357c0 .403.428.668.795.49l10.013-4.344a.546.546 0 0 0 .314-.496V6.84a.545.545 0 0 0-.795-.49l-10.013 4.344a.546.546 0 0 0-.314.496z" />
      <path d="M11.247 11.19v10.357c0 .403-.428.668-.795.49L.439 17.693a.546.546 0 0 1-.314-.496V6.84c0-.403.428-.668.795-.49l10.013 4.344a.546.546 0 0 1 .314.496z" />
    </svg>
  );
}

function DropboxIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 1.807L0 5.629l6 3.822 6-3.822zM18 1.807l-6 3.822 6 3.822 6-3.822zM0 13.274l6 3.822 6-3.822-6-3.822zM18 9.452l-6 3.822 6 3.822 6-3.822zM6 18.579l6 3.822 6-3.822-6-3.822z" />
    </svg>
  );
}

function SalesforceIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10.006 5.415a4.195 4.195 0 0 1 3.045-1.306c1.56 0 2.954.9 3.69 2.205.63-.3 1.35-.45 2.1-.45 2.85 0 5.159 2.34 5.159 5.22s-2.31 5.22-5.16 5.22c-.45 0-.9-.06-1.35-.165a3.993 3.993 0 0 1-3.54 2.145c-.63 0-1.26-.15-1.8-.42A4.8 4.8 0 0 1 7.68 21c-1.65 0-3.12-.84-3.99-2.115A4.482 4.482 0 0 1 2.1 19.2C.93 19.2 0 18.15 0 16.89c0-.75.36-1.395.93-1.785a5.207 5.207 0 0 1-.63-2.505c0-2.97 2.34-5.37 5.22-5.37.9 0 1.74.21 2.49.615a4.452 4.452 0 0 1 1.996-2.43z" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12c0 6.627-5.373 12-12 12S0 18.627 0 12 5.373 0 12 0s12 5.373 12 12zm-6.857-4.714H8.571c-1.578 0-2.857 1.279-2.857 2.857v3.714c0 1.578 1.279 2.857 2.857 2.857h2.858v-3.428H8.57V10.143h8.572v5.143h-2.857v3.428h2.857c1.578 0 2.857-1.279 2.857-2.857v-5.714c0-.79-.64-1.429-1.428-1.429l-1.429.001v-.428z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Provider category configuration                                    */
/* ------------------------------------------------------------------ */

export interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  accentColor?: string;
}

export interface ProviderCategory {
  title: string;
  description: string;
  providers: ProviderConfig[];
}

export const PROVIDER_CATEGORIES: ProviderCategory[] = [
  {
    title: "Productivity & Project Management",
    description:
      "Connect your productivity tools for AI-powered task management and automation.",
    providers: [
      {
        id: "linear",
        name: "Linear",
        description: "Issue tracking and project management",
        icon: <LinearIcon />,
        features: [
          "Create and manage issues from chat",
          "Track project progress and sprints",
          "Automate issue triage and labeling",
          "Get AI-powered project summaries",
        ],
      },
      {
        id: "notion",
        name: "Notion",
        description: "Notes, docs, wikis, and databases",
        icon: <NotionIcon />,
        features: [
          "Search and read Notion pages",
          "Create and update pages and databases",
          "Organize knowledge with AI assistance",
          "Automate content workflows",
        ],
      },
      {
        id: "github",
        name: "GitHub",
        description: "Repositories, issues, pull requests, and gists",
        icon: <GitHubIcon />,
        features: [
          "Browse repositories and code",
          "Create and manage issues and PRs",
          "Review code changes with AI",
          "Automate development workflows",
        ],
      },
      {
        id: "asana",
        name: "Asana",
        description: "Task management, projects, and team collaboration",
        icon: <AsanaIcon />,
        features: [
          "Create and assign tasks from chat",
          "Track project timelines and milestones",
          "Get AI-powered task prioritization",
          "Automate team coordination",
        ],
      },
      {
        id: "jira",
        name: "Jira",
        description: "Issue tracking, project management, and agile boards",
        icon: <JiraIcon />,
        features: [
          "Create and update Jira issues",
          "Manage sprints and backlogs",
          "Track team velocity and progress",
          "Automate agile workflows",
        ],
      },
      {
        id: "airtable",
        name: "Airtable",
        description: "Databases, spreadsheets, and project tracking",
        icon: <AirtableIcon />,
        features: [
          "Query and update Airtable bases",
          "Create records from conversations",
          "Build automated data pipelines",
          "Generate reports from your data",
        ],
      },
    ],
  },
  {
    title: "Cloud & Storage",
    description:
      "Connect cloud storage and CRM services for seamless data access.",
    providers: [
      {
        id: "dropbox",
        name: "Dropbox",
        description: "File storage, sharing, and collaboration",
        icon: <DropboxIcon />,
        features: [
          "Search and browse files",
          "Upload and organize documents",
          "Share files and folders",
          "Automate file management workflows",
        ],
      },
      {
        id: "salesforce",
        name: "Salesforce",
        description: "CRM - accounts, contacts, opportunities, and leads",
        icon: <SalesforceIcon />,
        features: [
          "Query accounts, contacts, and leads",
          "Create and update CRM records",
          "Track sales pipeline with AI insights",
          "Automate CRM data entry",
        ],
      },
    ],
  },
  {
    title: "Professional Networks",
    description:
      "Connect professional platforms for networking and content automation.",
    providers: [
      {
        id: "linkedin",
        name: "LinkedIn",
        description: "Professional networking, posts, and profiles",
        icon: <LinkedInIcon />,
        features: [
          "Create and publish LinkedIn posts",
          "Manage your professional presence with AI",
          "Automate content scheduling",
          "Engage with your professional network",
        ],
      },
    ],
  },
  {
    title: "Video & Meetings",
    description: "Connect video conferencing tools for meeting automation.",
    providers: [
      {
        id: "zoom",
        name: "Zoom",
        description: "Video meetings, webinars, and recordings",
        icon: <ZoomIcon />,
        features: [
          "Schedule and manage meetings",
          "Access meeting recordings",
          "Automate meeting follow-ups",
          "Get AI-powered meeting summaries",
        ],
      },
    ],
  },
];
