import { lazy, type ReactNode } from "react";

import { Pager } from "../../components/ui";

// Loaded on first visit: the charts library only ships with the pages that draw with it.
const Healthcare = lazy(() => import("./Healthcare"));
const ThinProfiles = lazy(() => import("./ThinProfiles"));
const V2Drift = lazy(() => import("./V2Drift"));
const CountryBias = lazy(() => import("./CountryBias"));
const RecruiterTrust = lazy(() => import("./RecruiterTrust"));

type Finding = { path: string; label: string; render: () => ReactNode };

export const FINDINGS: Finding[] = [
  { path: "/findings/healthcare", label: "Healthcare scale bug", render: () => <Healthcare /> },
  { path: "/findings/thin-profiles", label: "Thin profiles", render: () => <ThinProfiles /> },
  { path: "/findings/v2-drift", label: "v2 score drift", render: () => <V2Drift /> },
  { path: "/findings/country-bias", label: "Country bias", render: () => <CountryBias /> },
  { path: "/findings/recruiter-trust", label: "Recruiter trust", render: () => <RecruiterTrust /> },
];

export function FindingPager({ path }: { path: string }) {
  const index = FINDINGS.findIndex((finding) => finding.path === path);
  return <Pager prev={FINDINGS[index - 1]} next={FINDINGS[index + 1] ?? { path: "/segments", label: "Explore segments" }} />;
}
