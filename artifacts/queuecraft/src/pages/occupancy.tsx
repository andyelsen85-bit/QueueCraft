import * as React from "react";
import {
  useGetOccupancyOverview,
  getGetOccupancyOverviewQueryKey,
  useListDepartments,
  useListRoles,
} from "@workspace/api-client-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
} from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Calendar as CalendarIcon,
  Briefcase,
} from "lucide-react";
import { availableStyle, occupancyStyle } from "@/lib/occupancy";

type OccupancySort = "name" | "available" | "load";

export function Occupancy() {
  const [currentWeek, setCurrentWeek] = React.useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [view, setView] = React.useState<"week" | "month">("week");
  const [departmentId, setDepartmentId] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [sortBy, setSortBy] = React.useState<OccupancySort>("name");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("asc");
  const [expandedMembers, setExpandedMembers] = React.useState<Set<string>>(
    () => new Set(),
  );
  const { data: departments } = useListDepartments();
  const { data: roles } = useListRoles();
  const sortedDepartments = React.useMemo(
    () =>
      [...(departments ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    [departments],
  );
  const sortedRoles = React.useMemo(
    () =>
      [...(roles ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    [roles],
  );

  const weekStartStr = format(currentWeek, "yyyy-MM-dd");
  const startDate = view === "week" ? currentWeek : startOfMonth(currentWeek);
  const endDate =
    view === "week"
      ? endOfWeek(currentWeek, { weekStartsOn: 1 })
      : endOfMonth(currentWeek);
  const occupancyParams = {
    startDate: format(startDate, "yyyy-MM-dd"),
    endDate: format(endDate, "yyyy-MM-dd"),
  };
  const { data: occupancyOverviews, isLoading } = useGetOccupancyOverview(
    occupancyParams,
    { query: { queryKey: getGetOccupancyOverviewQueryKey(occupancyParams) } },
  );
  const visibleMemberIds = React.useMemo(() => {
    if (!departmentId && !roleId) return null;
    const matchingRoles = (roles ?? []).filter(
      (role) =>
        (!departmentId ||
          role.departmentIds?.includes(departmentId) ||
          role.departmentId === departmentId) &&
        (!roleId || role.id === roleId),
    );
    return new Set(
      matchingRoles.flatMap(
        (role) =>
          [role.lead.id, role.deputy?.id, ...(role.memberIds ?? [])].filter(
            Boolean,
          ) as string[],
      ),
    );
  }, [departmentId, roleId, roles]);
  const overviews = React.useMemo(() => {
    const filtered = (occupancyOverviews ?? []).filter(
      (overview) =>
        !visibleMemberIds || visibleMemberIds.has(overview.member.id),
    );
    return [...filtered].sort((left, right) => {
      const comparison =
        sortBy === "name"
          ? left.member.name.localeCompare(right.member.name)
          : sortBy === "available"
            ? left.availablePercent - right.availablePercent
            : left.totalOccupancyPercent - right.totalOccupancyPercent;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [occupancyOverviews, sortBy, sortDirection, visibleMemberIds]);

  const allExpanded =
    overviews.length > 0 &&
    overviews.every((overview) => expandedMembers.has(overview.member.id));

  const toggleMember = (memberId: string) => {
    setExpandedMembers((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toggleAll = () => {
    setExpandedMembers(
      allExpanded
        ? new Set()
        : new Set(overviews.map((overview) => overview.member.id)),
    );
  };

  const goNextWeek = () =>
    setCurrentWeek((prev) =>
      view === "week" ? addWeeks(prev, 1) : addMonths(prev, 1),
    );
  const goPrevWeek = () =>
    setCurrentWeek((prev) =>
      view === "week" ? subWeeks(prev, 1) : subMonths(prev, 1),
    );

  const handleDateChange = (value: string) => {
    if (value) {
      const date = parseISO(value);
      if (!isNaN(date.getTime())) {
        setCurrentWeek(
          view === "week"
            ? startOfWeek(date, { weekStartsOn: 1 })
            : startOfMonth(date),
        );
      }
    }
  };

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Capacity Planning
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Occupancy Overview
          </h1>
          <p className="text-muted-foreground mt-1">
            Review team capacity, BAU commitments, and topic allocations by week
            or month.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-1">
          <select
            aria-label="Filter department"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={departmentId}
            onChange={(event) => {
              setDepartmentId(event.target.value);
              setRoleId("");
            }}
          >
            <option value="">All departments</option>
            {sortedDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter role"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
          >
            <option value="">All roles</option>
            {sortedRoles
              .filter(
                (role) =>
                  !departmentId ||
                  role.departmentIds?.includes(departmentId) ||
                  role.departmentId === departmentId,
              )
              .map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
          </select>
          <div className="flex rounded-sm border bg-background p-0.5">
            <Button
              size="sm"
              variant={view === "week" ? "default" : "ghost"}
              onClick={() => setView("week")}
            >
              Week
            </Button>
            <Button
              size="sm"
              variant={view === "month" ? "default" : "ghost"}
              onClick={() => setView("month")}
            >
              Month
            </Button>
          </div>
          <Button variant="ghost" size="icon" onClick={goPrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="relative">
            <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <DateField
              value={weekStartStr}
              onChange={handleDateChange}
              className="w-[160px] pl-9 h-9 bg-transparent border-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={goNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-2 shadow-sm">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{overviews.length}</span>{" "}
          active {overviews.length === 1 ? "member" : "members"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Sort by
            <select
              aria-label="Sort occupancy"
              className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as OccupancySort)
              }
            >
              <option value="name">Name</option>
              <option value="available">Available capacity</option>
              <option value="load">Total load</option>
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setSortDirection((current) =>
                current === "asc" ? "desc" : "asc",
              )
            }
            aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
          >
            {sortDirection === "asc" ? (
              <ArrowUp className="mr-2 h-4 w-4" />
            ) : (
              <ArrowDown className="mr-2 h-4 w-4" />
            )}
            {sortDirection === "asc" ? "Ascending" : "Descending"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Occupancy scale</span>
        <span
          className="h-2 w-32 rounded-full border"
          style={{
            background:
              "linear-gradient(to right, rgb(220, 252, 231), rgb(255, 237, 213), rgb(254, 226, 226))",
          }}
          aria-hidden="true"
        />
        <span>Low</span>
        <span>Midpoint</span>
        <span>High</span>
        <span className="sr-only">
          Green indicates low occupancy, orange indicates midpoint occupancy,
          and red indicates high occupancy.
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      ) : !overviews || overviews.length === 0 ? (
        <div className="p-12 text-center text-sm text-muted-foreground border-2 border-dashed border-muted rounded-sm">
          No active members found.
        </div>
      ) : (
        <div className="grid gap-3">
          {overviews.map((overview) => {
            const isOver = overview.overAllocated;
            const isExpanded = expandedMembers.has(overview.member.id);
            const allocations = [
              ...(overview.topics ?? []),
              ...(overview.milestones ?? []),
            ].sort((left, right) =>
              left.title.localeCompare(right.title, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            );

            return (
              <Card
                key={overview.member.id}
                className={`overflow-hidden transition-colors ${isOver ? "border-destructive/50 shadow-sm shadow-destructive/10" : ""}`}
              >
                <CardHeader
                  className={`flex flex-row items-center justify-between space-y-0 p-3 ${isExpanded ? "border-b" : ""} ${isOver ? "bg-destructive/5" : "bg-muted/10"}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0 border bg-background">
                      <AvatarFallback className="font-bold">
                        {overview.member.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {overview.member.name}
                      </CardTitle>
                      <CardDescription className="mt-0.5 flex items-center gap-2 truncate">
                        <span className="truncate">
                          {overview.member.title || "Member"}
                        </span>
                        {isOver && (
                          <span
                            className="inline-flex shrink-0 items-center rounded-sm border px-2 py-0.5 text-xs font-semibold"
                            style={occupancyStyle(overview.totalOccupancyPercent)}
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />{" "}
                            Overallocated ({overview.totalOccupancyPercent}%)
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="ml-3 flex shrink-0 items-center gap-4">
                    <div className="min-w-[74px] text-right">
                      <div
                        className="rounded-sm border px-1 text-xl font-bold tracking-tight"
                        style={availableStyle(overview.availablePercent)}
                      >
                        {overview.availablePercent}%
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Available
                      </div>
                    </div>
                    <div className="hidden h-9 w-px bg-border sm:block"></div>
                      <div
                        className="hidden min-w-[70px] rounded-sm border px-1 text-right sm:block"
                        style={occupancyStyle(overview.totalOccupancyPercent)}
                      >
                      <div className="text-lg font-semibold tracking-tight">
                        {overview.totalOccupancyPercent}%
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Total Load
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleMember(overview.member.id)}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${overview.member.name}`}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border">
                    {/* BAU Section */}
                    <div className="sm:w-1/3 p-4 bg-muted/5">
                      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground">
                        <Briefcase className="h-4 w-4" /> Daily Business (BAU)
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-sm border bg-background">
                        <span className="text-sm font-medium">
                          Standard Operations
                        </span>
                        <span
                          className="rounded-sm border px-1 text-sm font-mono font-bold"
                          style={occupancyStyle(overview.dailyBusinessPercent)}
                        >
                          {overview.dailyBusinessPercent}%
                        </span>
                      </div>
                    </div>

                    {/* Topics Section */}
                    <div className="sm:w-2/3 p-4">
                      <div className="text-sm font-semibold text-muted-foreground mb-3">
                        Topic and Milestone Allocations
                      </div>
                      {allocations.length === 0 ? (
                        <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-sm text-center bg-muted/10">
                          No topics allocated for this {view}.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {allocations.map(
                            (topic: {
                              topicId: string;
                              milestoneId?: string | null;
                              title: string;
                              allocationPercent: number;
                              allocationType: string;
                            }) => (
                              <div
                                key={
                                  topic.milestoneId
                                    ? `milestone:${topic.milestoneId}`
                                    : `topic:${topic.topicId}`
                                }
                                className="flex items-center justify-between p-3 rounded-sm border bg-background hover:border-primary/50 transition-colors"
                              >
                                <span className="text-sm font-medium truncate pr-4">
                                  {topic.allocationType === "milestone"
                                    ? "Milestone · "
                                    : "Topic · "}
                                  {topic.title}
                                </span>
                                 <span
                                   className="rounded-sm border px-1 text-sm font-mono font-bold whitespace-nowrap"
                                   style={occupancyStyle(topic.allocationPercent)}
                                 >
                                  {topic.allocationPercent}%
                                </span>
                              </div>
                            ),
                          )}
                          {allocations.length > 0 && (
                            <div className="flex justify-end pt-2 px-1">
                              <div className="text-xs font-mono text-muted-foreground">
                                {view === "month"
                                  ? "Average allocated work"
                                  : "Allocated Work"}
                                :{" "}
                                 <span
                                   className="rounded-sm border px-1 font-bold"
                                   style={occupancyStyle(
                                     overview.topicAllocationPercent +
                                       (overview.milestoneAllocationPercent ?? 0),
                                   )}
                                 >
                                  {overview.topicAllocationPercent +
                                    (overview.milestoneAllocationPercent ?? 0)}
                                  %
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar visualization */}
                  <div className="h-2 w-full bg-muted flex">
                    <div
                       className="h-full transition-all"
                       style={{
                         ...occupancyStyle(overview.dailyBusinessPercent),
                         width: `${Math.min(100, overview.dailyBusinessPercent)}%`,
                       }}
                      title={`BAU: ${overview.dailyBusinessPercent}%`}
                    />
                    <div
                      className="h-full transition-all"
                      style={{
                        ...occupancyStyle(
                          overview.topicAllocationPercent +
                            (overview.milestoneAllocationPercent ?? 0),
                        ),
                        width: `${Math.max(0, Math.min(100 - overview.dailyBusinessPercent, overview.topicAllocationPercent + (overview.milestoneAllocationPercent ?? 0)))}%`,
                      }}
                      title={`Topics and milestones: ${overview.topicAllocationPercent + (overview.milestoneAllocationPercent ?? 0)}%`}
                    />
                  </div>
                </CardContent>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
