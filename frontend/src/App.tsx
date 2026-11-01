import { Code2, Database, Grid2x2, LayoutDashboard, Monitor, Moon, Scale, Sun, Users } from "lucide-react";
import { lazy, Suspense, useEffect, type ReactNode } from "react";

import { Logo, Skeleton } from "./components/ui";
import { IS_STATIC } from "./lib/api";
import { href, useRoute } from "./lib/router";
import { useTheme } from "./lib/theme";
import { FINDINGS } from "./pages/findings";
import Overview from "./pages/Overview";

const Segments = lazy(() => import("./pages/Segments"));
const Disagreements = lazy(() => import("./pages/Disagreements"));
const ThirdOpinion = lazy(() => import("./pages/ThirdOpinion"));
const DataMethod = lazy(() => import("./pages/DataMethod"));

const REPO = "https://github.com/asadaslam556/crosscheck";

type Page = { path: string; label: string; icon?: ReactNode; step?: number; render: () => ReactNode };

const MAIN: Page[] = [{ path: "/", label: "Overview", icon: <LayoutDashboard size={16} />, render: () => <Overview /> }];

const EXPLORE: Page[] = [
  { path: "/segments", label: "Segments", icon: <Grid2x2 size={16} />, render: () => <Segments /> },
  { path: "/disagreements", label: "Disagreements", icon: <Scale size={16} />, render: () => <Disagreements /> },
  { path: "/third-opinion", label: "Third opinion", icon: <Users size={16} />, render: () => <ThirdOpinion /> },
  { path: "/data", label: "Data & method", icon: <Database size={16} />, render: () => <DataMethod /> },
];

const PAGES = [...MAIN, ...FINDINGS.map((f, i) => ({ ...f, step: i + 1 })), ...EXPLORE];

export default function App() {
  const { path } = useRoute();
  const { theme, cycle } = useTheme();
  const page = PAGES.find((candidate) => candidate.path === path) ?? PAGES[0];

  useEffect(() => {
    document.title = page.path === "/" ? "Crosscheck" : `${page.label} · Crosscheck`;
    window.scrollTo(0, 0);
  }, [page]);

  const link = (item: Page) => (
    <a key={item.path} href={href(item.path)} aria-current={item.path === page.path ? "page" : undefined}>
      {item.step ? <span className="step">{item.step}</span> : item.icon}
      {item.label}
    </a>
  );

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href={href("/")} aria-label="Crosscheck, overview">
          <Logo />
          <span>
            cross<b>check</b>
          </span>
        </a>
        <nav className="nav" aria-label="Pages">
          {MAIN.map(link)}
          <div className="nav-group">Findings</div>
          {PAGES.filter((item) => item.step).map(link)}
          <div className="nav-group">Explore</div>
          {EXPLORE.map(link)}
        </nav>
        <div className="sidebar-foot">
          {IS_STATIC && <span className="static-pill">Static demo, data from Sep 2025 to Jul 2026</span>}
          <div className="sidebar-actions">
            <button type="button" className="icon-button" onClick={cycle} aria-label={`Theme: ${theme}. Change theme`}>
              <ThemeIcon size={14} aria-hidden="true" /> {theme[0].toUpperCase() + theme.slice(1)}
            </button>
            <a className="icon-button" href={REPO} target="_blank" rel="noreferrer">
              <Code2 size={14} aria-hidden="true" /> Source
            </a>
          </div>
        </div>
      </aside>
      <main className="main" key={page.path}>
        <Suspense fallback={<Skeleton height={480} />}>{page.render()}</Suspense>
      </main>
    </div>
  );
}
