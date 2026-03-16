import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { IssueTimeline } from "../components/IssueTimeline";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { GanttChart } from "lucide-react";

export function IssueTimelinePage() {
  const { selectedCompanyId, companies } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Issue Timeline" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={GanttChart}
          message="Set up a company to view the issue timeline."
          action="Get Started"
          onAction={() => {}}
        />
      );
    }
    return (
      <EmptyState icon={GanttChart} message="Select a company to view the issue timeline." />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load issues"}
      </p>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-6rem)]">
      <IssueTimeline issues={issues ?? []} isLoading={false} variant="gantt" />
    </div>
  );
}
