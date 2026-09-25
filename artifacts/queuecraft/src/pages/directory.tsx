import * as React from "react";
import {
  useListDepartments,
  useListRoles,
  useListMembers,
  useCreateDepartment,
  useUpdateDepartment,
  useCreateRole,
  useUpdateRole,
  useCreateMember,
  useUpdateMember,
  useGetSession,
  getListDepartmentsQueryKey,
  getListRolesQueryKey,
  getListMembersQueryKey,
  getGetOccupancyOverviewQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TabsContent,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Plus,
  Trash2,
  UsersRound,
  ShieldCheck,
  Network,
  Grid2X2,
  Download,
  ChevronDown,
} from "lucide-react";
import { jsPDF } from "jspdf";

type MemberDraft = {
  name: string;
  email: string;
  title: string;
  externalSubject: string;
  accountType: "local" | "external";
  password: string;
  isCio: boolean;
  headDepartmentIds: string[];
  deputyDepartmentIds: string[];
  dailyBusinessTasks: DailyBusinessTask[];
};
type DailyBusinessTask = { name: string; percent: number };

type DepartmentDraft = {
  name: string;
  serviceHeadId: string;
  serviceHeadDeputyId: string;
};

type RoleDraft = {
  name: string;
  departmentId: string;
  departmentIds: string[];
  leadId: string;
  deputyId: string;
  memberIds: string[];
};

type AdUser = {
  subject: string;
  email: string;
  name: string;
};

const nameCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

function sortByName<T extends { name: string }>(items: readonly T[] | undefined) {
  return items
    ? items
        .map((item, index) => ({ item, index }))
        .sort(
          (a, b) =>
            nameCollator.compare(a.item.name, b.item.name) || a.index - b.index,
        )
        .map(({ item }) => item)
    : [];
}

const emptyMember: MemberDraft = {
  name: "",
  email: "",
  title: "",
  externalSubject: "",
  accountType: "external",
  password: "",
  isCio: false,
  headDepartmentIds: [],
  deputyDepartmentIds: [],
  dailyBusinessTasks: [],
};
const emptyDepartment: DepartmentDraft = {
  name: "",
  serviceHeadId: "",
  serviceHeadDeputyId: "",
};
const emptyRole: RoleDraft = {
  name: "",
  departmentId: "",
  departmentIds: [],
  leadId: "",
  deputyId: "",
  memberIds: [],
};

function mutationError(error: unknown) {
  if (!error) return null;
  return error instanceof Error
    ? error.message
    : "The change could not be saved.";
}

type MatrixMember = { id: string; name: string; title?: string | null };
type MatrixRole = {
  id: string;
  name: string;
  lead: { id: string };
  deputy?: { id: string } | null;
  memberIds?: string[] | null;
};
type DirectoryMatrixProps = {
  members: MatrixMember[];
  roles: MatrixRole[];
};

function MatrixCell({
  member,
  role,
}: {
  member: MatrixMember;
  role: MatrixRole;
}) {
  const isLead = role.lead.id === member.id;
  const isDeputy = role.deputy?.id === member.id;
  const isMember = (role.memberIds ?? []).includes(member.id);
  if (!isLead && !isDeputy && !isMember) {
    return <span className="text-muted-foreground/30">—</span>;
  }
  return (
    <span
      className={
        isLead
          ? "font-bold text-destructive"
          : "font-semibold text-foreground"
      }
      title={isLead ? "Role lead" : isDeputy ? "Role deputy/member" : "Role member"}
    >
      {isLead ? "X!" : "X"}
    </span>
  );
}

function exportMatrixPdf(
  members: DirectoryMatrixProps["members"],
  roles: DirectoryMatrixProps["roles"],
) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 32;
  const memberColumnWidth = 132;
  const roleColumnWidth = 44;
  const rowHeight = 19;
  const tableTop = 74;
  const legendHeight = 30;
  const headerFontSize = 7;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(headerFontSize);
  const longestRoleName = roles.reduce(
    (longest, role) => Math.max(longest, pdf.getTextWidth(role.name)),
    0,
  );
  const headerHeight = Math.max(42, longestRoleName + 12);
  const tableWidth = memberColumnWidth + roles.length * roleColumnWidth;
  const tableHeight = headerHeight + members.length * rowHeight;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - tableTop - margin - legendHeight;
  const scale = Math.min(1, availableWidth / tableWidth, availableHeight / tableHeight);
  const scaledMemberWidth = memberColumnWidth * scale;
  const scaledRoleWidth = roleColumnWidth * scale;
  const scaledRowHeight = rowHeight * scale;
  const scaledHeaderHeight = headerHeight * scale;
  const scaledTableWidth = tableWidth * scale;
  const scaledTableHeight = tableHeight * scale;
  const generatedDate = new Date();
  const generated = [
    String(generatedDate.getDate()).padStart(2, "0"),
    String(generatedDate.getMonth() + 1).padStart(2, "0"),
    generatedDate.getFullYear(),
  ].join("/");

  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageWidth, 58, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("QueueCraft", margin, 25);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text("Directory member-by-role matrix", margin, 43);
  pdf.setFontSize(9);
  pdf.text(generated, pageWidth - margin, 26, { align: "right" });

  pdf.setFillColor(241, 245, 249);
  pdf.rect(margin, tableTop, scaledTableWidth, scaledHeaderHeight, "F");
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(Math.max(0.25, 0.6 * scale));
  pdf.rect(margin, tableTop, scaledTableWidth, scaledTableHeight);
  pdf.setTextColor(30, 41, 59);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(Math.max(3, 9 * scale));
  pdf.text("MEMBER", margin + 7 * scale, tableTop + scaledHeaderHeight / 2, {
    baseline: "middle",
  });
  roles.forEach((role, index) => {
    const x = margin + scaledMemberWidth + index * scaledRoleWidth;
    pdf.line(x, tableTop, x, tableTop + scaledTableHeight);
    pdf.setFontSize(headerFontSize * scale);
    // jsPDF applies `align: "center"` to the unrotated x coordinate, which
    // shifts a 90-degree label out of its column. Center it along y instead.
    pdf.text(role.name, x + scaledRoleWidth / 2, tableTop + scaledHeaderHeight / 2 + pdf.getTextWidth(role.name) / 2, {
      angle: 90,
    });
  });
  pdf.line(
    margin + scaledMemberWidth,
    tableTop,
    margin + scaledMemberWidth,
    tableTop + scaledTableHeight,
  );
  members.forEach((member, memberIndex) => {
    const y = tableTop + scaledHeaderHeight + memberIndex * scaledRowHeight;
    if (memberIndex % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y, scaledTableWidth, scaledRowHeight, "F");
    }
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, y, margin + scaledTableWidth, y);
    pdf.setTextColor(51, 65, 85);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(Math.max(3, 8 * scale));
    pdf.text(member.name, margin + 7 * scale, y + scaledRowHeight * 0.72, {
      maxWidth: Math.max(1, (scaledMemberWidth - 14 * scale)),
    });
    roles.forEach((role, roleIndex) => {
      const x = margin + scaledMemberWidth + roleIndex * scaledRoleWidth;
      const isLead = role.lead.id === member.id;
      const isDeputy = role.deputy?.id === member.id;
      const isMember = (role.memberIds ?? []).includes(member.id);
      if (!isLead && !isDeputy && !isMember) return;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(Math.max(3, 9 * scale));
      pdf.setTextColor(isLead ? 185 : 15, isLead ? 28 : 23, isLead ? 28 : 42);
      pdf.text(isLead ? "X!" : "X", x + scaledRoleWidth / 2, y + scaledRowHeight * 0.72, {
        align: "center",
      });
    });
  });
  const legendY = Math.min(pageHeight - margin, tableTop + scaledTableHeight + 18 * scale);
  pdf.setFontSize(Math.max(5, 8 * scale));
  pdf.setTextColor(71, 85, 105);
  pdf.setFont("helvetica", "normal");
  pdf.text("Legend:", margin, legendY);
  pdf.setTextColor(15, 23, 42);
  pdf.text("X = member", margin + 38 * scale, legendY);
  pdf.setTextColor(185, 28, 28);
  pdf.text("X! = role lead", margin + 104 * scale, legendY);
  pdf.save(`queuecraft-directory-matrix-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function DirectoryMatrix({ members, roles }: DirectoryMatrixProps) {
  const roleHeaderHeight = Math.max(
    112,
    ...roles.map((role) => role.name.length * 16 + 16),
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg">Member-by-role matrix</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Review role membership and leads at a glance.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => exportMatrixPdf(members, roles)}
          disabled={!members.length || !roles.length}
        >
          <Download className="mr-2 h-4 w-4" />
          Download landscape PDF
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span><strong className="text-foreground">X</strong> Member</span>
          <span><strong className="text-destructive">X!</strong> Role lead</span>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60">
                <th className="sticky left-0 z-10 w-1/5 border-b border-r bg-muted/90 px-3 py-3 text-left font-semibold">
                  Member
                </th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    className="border-b border-l px-0.5 py-2 text-center align-bottom font-semibold"
                    title={role.name}
                  >
                    <span
                      className="mx-auto block whitespace-nowrap text-xs [writing-mode:vertical-rl] [transform:rotate(180deg)]"
                      style={{ height: `${roleHeaderHeight}px` }}
                      aria-label={role.name}
                    >
                      {role.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member, index) => (
                <tr key={member.id} className={index % 2 ? "bg-muted/20" : ""}>
                  <th className="sticky left-0 z-10 border-r px-4 py-3 text-left font-medium bg-background">
                    <span>{member.name}</span>
                    {member.title && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {member.title}
                      </span>
                    )}
                  </th>
                  {roles.map((role) => (
                    <td key={role.id} className="border-t border-l px-0.5 py-2 text-center">
                      <MatrixCell member={member} role={role} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!members.length || !roles.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Add members and roles to populate the matrix.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function Directory() {
  const queryClient = useQueryClient();
  const {
    data: departments,
    isLoading: ld,
    isError: de,
  } = useListDepartments();
  const { data: roles, isLoading: lr, isError: re } = useListRoles();
  const { data: members, isLoading: lm, isError: me } = useListMembers();
  const { data: session } = useGetSession();
  const canManageCio =
    session?.capabilities?.includes("directory.manage") ?? false;
  const canResetLocalPassword =
    session?.capabilities?.includes("local_password.reset") ?? false;
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const createMember = useCreateMember();
  const updateMember = useUpdateMember();

  const [memberDialog, setMemberDialog] = React.useState<{
    open: boolean;
    id?: string;
  }>({ open: false });
  const [departmentDialog, setDepartmentDialog] = React.useState<{
    open: boolean;
    id?: string;
  }>({ open: false });
  const [roleDialog, setRoleDialog] = React.useState<{
    open: boolean;
    id?: string;
  }>({ open: false });
  const [memberDraft, setMemberDraft] = React.useState(emptyMember);
  const [departmentDraft, setDepartmentDraft] = React.useState(emptyDepartment);
  const [roleDraft, setRoleDraft] = React.useState(emptyRole);
  const [adSearch, setAdSearch] = React.useState("");
  const [adUsers, setAdUsers] = React.useState<AdUser[]>([]);
  const [selectedAdUsers, setSelectedAdUsers] = React.useState<string[]>([]);
  const [adLoading, setAdLoading] = React.useState(false);
  const [adImporting, setAdImporting] = React.useState(false);
  const [adMessage, setAdMessage] = React.useState("");
  const [adError, setAdError] = React.useState("");
  const [memberActionError, setMemberActionError] = React.useState("");
  const [memberActionMessage, setMemberActionMessage] = React.useState("");
  const [resetPassword, setResetPassword] = React.useState("");
  const [expandedRoleMembers, setExpandedRoleMembers] = React.useState<Set<string>>(
    () => new Set(),
  );

  const invalidateDirectory = () => {
    queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
  };

  const openMember = (member?: NonNullable<typeof members>[number]) => {
    const current = member as
      | (NonNullable<typeof members>[number] & {
          authProvider?: string | null;
          isCio?: boolean;
          externalSubject?: string | null;
        })
      | undefined;
    setMemberDraft(
      member
        ? {
            name: member.name,
            email: member.email,
            title: member.title ?? "",
            externalSubject:
              current?.externalSubject ?? "",
            accountType: current?.authProvider === "local" ? "local" : "external",
            password: "",
            isCio: Boolean(current?.isCio),
            headDepartmentIds: (departments ?? [])
              .filter((department) => department.serviceHead.id === member.id)
              .map((department) => department.id),
            deputyDepartmentIds: (departments ?? [])
              .filter((department) => department.serviceHeadDeputy?.id === member.id)
              .map((department) => department.id),
            dailyBusinessTasks: member.dailyBusinessTasks.map((task) => ({
                name: task.name,
                percent: task.percent,
              })),
          }
        : emptyMember,
    );
    setMemberActionError("");
    setMemberActionMessage("");
    setResetPassword("");
    setMemberDialog({ open: true, id: member?.id });
  };

  const openDepartment = (
    department?: NonNullable<typeof departments>[number],
  ) => {
    setDepartmentDraft(
      department
        ? {
            name: department.name,
            serviceHeadId: department.serviceHead.id,
            serviceHeadDeputyId: department.serviceHeadDeputy?.id ?? "",
          }
        : emptyDepartment,
    );
    setDepartmentDialog({ open: true, id: department?.id });
  };

  const openRole = (role?: NonNullable<typeof roles>[number]) => {
    setRoleDraft(
      role
        ? {
            name: role.name,
            departmentId: role.departmentId,
            departmentIds: role.departmentIds?.length
              ? role.departmentIds
              : [role.departmentId],
            leadId: role.lead.id,
            deputyId: role.deputy?.id ?? "",
            memberIds: role.memberIds ?? [],
          }
        : emptyRole,
    );
    setRoleDialog({ open: true, id: role?.id });
  };

  const submitMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setMemberActionError("");
    setMemberActionMessage("");
    if (!memberDialog.id && memberDraft.accountType === "local" && memberDraft.password.length < 12) {
      setMemberActionError("Local account passwords must be at least 12 characters.");
      return;
    }
    const dailyBusinessTasks = memberDraft.dailyBusinessTasks.map((task) => ({
      name: task.name.trim(),
      percent: Number(task.percent),
    }));
    const taskNames = dailyBusinessTasks.map((task) => task.name.toLocaleLowerCase());
    if (dailyBusinessTasks.some((task) => !task.name)) {
      setMemberActionError("BAU task names cannot be empty.");
      return;
    }
    if (new Set(taskNames).size !== taskNames.length) {
      setMemberActionError("BAU task names must be unique.");
      return;
    }
    if (dailyBusinessTasks.some((task) => !Number.isInteger(task.percent) || task.percent < 0 || task.percent > 100)) {
      setMemberActionError("BAU task percentages must be whole numbers from 0 to 100.");
      return;
    }
    if (dailyBusinessTasks.reduce((total, task) => total + task.percent, 0) > 100) {
      setMemberActionError("BAU task percentages cannot total more than 100%.");
      return;
    }
    const data = {
      name: memberDraft.name.trim(),
      email: memberDraft.email.trim(),
      title: memberDraft.title.trim() || null,
      ...(!memberDialog.id
        ? { externalSubject: memberDraft.accountType === "external" ? memberDraft.externalSubject.trim() || null : null }
        : memberDraft.accountType === "external" && memberDraft.externalSubject.trim()
          ? { externalSubject: memberDraft.externalSubject.trim() }
          : {}),
      ...(memberDialog.id || memberDraft.accountType !== "local"
        ? {}
        : { password: memberDraft.password }),
      ...(canManageCio ? { isCio: memberDraft.isCio } : {}),
      headDepartmentIds: memberDraft.headDepartmentIds,
      deputyDepartmentIds: memberDraft.deputyDepartmentIds,
      dailyBusinessTasks,
    };
    try {
      if (memberDialog.id)
        await updateMember.mutateAsync({ memberId: memberDialog.id, data });
      else
        await createMember.mutateAsync({ data });
      setMemberDialog({ open: false });
      setMemberActionMessage("Member and permissions saved.");
      invalidateDirectory();
      queryClient.invalidateQueries({ queryKey: getGetOccupancyOverviewQueryKey() });
    } catch (saveError) {
      setMemberActionError(
        saveError instanceof Error
          ? saveError.message
          : "Member could not be saved.",
      );
    }
  };

  const resetMemberPassword = async (member: NonNullable<typeof members>[number]) => {
    if (resetPassword.length < 12) {
      setMemberActionError("Reset passwords must be at least 12 characters.");
      return;
    }
    setMemberActionError("");
    try {
      const current = member as typeof member & { authProvider?: string | null };
      if (current.authProvider !== "local") {
        throw new Error("Only local accounts have QueueCraft passwords.");
      }
      const csrf = await fetch("/api/auth/csrf", { credentials: "include" }).then((r) => r.json());
      const response = await fetch(`/api/directory/members/${member.id}/password`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.csrfToken },
        body: JSON.stringify({ password: resetPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Password could not be reset.");
      setResetPassword("");
      setMemberActionMessage("Local account password reset.");
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : "Password could not be reset.");
    }
  };

  const deleteMember = async (member: NonNullable<typeof members>[number]) => {
    if (
      !window.confirm(
        `Delete ${member.name}? They will immediately lose access to QueueCraft.`,
      )
    )
      return;
    setMemberActionError("");
    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        credentials: "include",
      });
      const { csrfToken } = await csrfResponse.json();
      const response = await fetch(`/api/directory/members/${member.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Member could not be deleted.");
      }
      invalidateDirectory();
    } catch (deleteError) {
      setMemberActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "Member could not be deleted.",
      );
    }
  };

  const submitDepartment = async (event: React.FormEvent) => {
    event.preventDefault();
    const data = {
      name: departmentDraft.name.trim(),
      serviceHeadId: departmentDraft.serviceHeadId,
      serviceHeadDeputyId: departmentDraft.serviceHeadDeputyId || null,
    };
    try {
      if (departmentDialog.id)
        await updateDepartment.mutateAsync({
          departmentId: departmentDialog.id,
          data,
        });
      else await createDepartment.mutateAsync({ data });
      setDepartmentDialog({ open: false });
      invalidateDirectory();
    } catch {}
  };

  const submitRole = async (event: React.FormEvent) => {
    event.preventDefault();
    const data = {
      name: roleDraft.name.trim(),
      departmentId: roleDraft.departmentId,
      departmentIds: [
        ...new Set(
          [roleDraft.departmentId, ...roleDraft.departmentIds].filter(Boolean),
        ),
      ],
      leadId: roleDraft.leadId,
      deputyId: roleDraft.deputyId || null,
      memberIds: roleDraft.memberIds,
    };
    try {
      if (roleDialog.id)
        await updateRole.mutateAsync({ roleId: roleDialog.id, data });
      else await createRole.mutateAsync({ data });
      setRoleDialog({ open: false });
      invalidateDirectory();
    } catch {}
  };

  const searchActiveDirectory = async () => {
    setAdLoading(true);
    setAdError("");
    setAdMessage("");
    try {
      const response = await fetch(
        `/api/directory/ldap-users?search=${encodeURIComponent(adSearch.trim())}`,
        { credentials: "include" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error ?? "Active Directory search failed.");
      setAdUsers(Array.isArray(body) ? body : []);
      setSelectedAdUsers([]);
      if (!body.length)
        setAdMessage("No matching Active Directory users were found.");
    } catch (searchError) {
      setAdUsers([]);
      setAdError(
        searchError instanceof Error
          ? searchError.message
          : "Active Directory search failed.",
      );
    } finally {
      setAdLoading(false);
    }
  };

  const importActiveDirectoryUsers = async () => {
    const users = adUsers.filter((user) =>
      selectedAdUsers.includes(user.subject),
    );
    if (!users.length) return;
    setAdImporting(true);
    setAdError("");
    setAdMessage("");
    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        credentials: "include",
      });
      const { csrfToken } = await csrfResponse.json();
      const response = await fetch("/api/directory/ldap-users/import", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ users }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          body.error ?? "Active Directory users could not be imported.",
        );
      setAdMessage(
        `${body.imported ?? users.length} user${body.imported === 1 ? "" : "s"} imported. Existing members were skipped.`,
      );
      setAdUsers([]);
      setSelectedAdUsers([]);
      invalidateDirectory();
    } catch (importError) {
      setAdError(
        importError instanceof Error
          ? importError.message
          : "Active Directory users could not be imported.",
      );
    } finally {
      setAdImporting(false);
    }
  };

  const loading = ld || lr || lm;
  const error = de || re || me;
  const sortedDepartments = React.useMemo(
    () => sortByName(departments),
    [departments],
  );
  const sortedRoles = React.useMemo(() => sortByName(roles), [roles]);
  const sortedMembers = React.useMemo(() => sortByName(members), [members]);
  const sortedAdUsers = React.useMemo(() => sortByName(adUsers), [adUsers]);

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Directory control
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Organization Directory
          </h1>
          <p className="text-muted-foreground mt-1">
            Create the people and routing structure that powers validation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openMember()}>
            <Plus className="mr-2 h-4 w-4" />
            Member
          </Button>
          <Button variant="outline" onClick={() => openDepartment()}>
            <Plus className="mr-2 h-4 w-4" />
            Department
          </Button>
          <Button onClick={() => openRole()}>
            <Plus className="mr-2 h-4 w-4" />
            Role
          </Button>
        </div>
      </div>
      {error && (
        <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Directory data could not be loaded. Refresh and try again.
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Import users from Active Directory
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Search the configured directory, select users, and provision them as
            allowed QueueCraft members. Only imported active members can sign in
            with AD FS.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={adSearch}
              placeholder="Search by name, email, or account"
              onChange={(event) => setAdSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void searchActiveDirectory();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void searchActiveDirectory()}
              disabled={adLoading}
            >
              {adLoading ? "Searching…" : "Search directory"}
            </Button>
          </div>
          {adError && <p className="text-sm text-destructive">{adError}</p>}
          {adMessage && <p className="text-sm text-emerald-700">{adMessage}</p>}
          {adUsers.length > 0 && (
            <div className="space-y-3">
              <div className="max-h-64 overflow-y-auto rounded-sm border divide-y">
                {sortedAdUsers.map((user) => (
                  <label
                    key={user.subject}
                    className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAdUsers.includes(user.subject)}
                      onChange={(event) =>
                        setSelectedAdUsers((current) =>
                          event.target.checked
                            ? [...current, user.subject]
                            : current.filter(
                                (subject) => subject !== user.subject,
                              ),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{user.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {user.email}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <Button
                type="button"
                onClick={() => void importActiveDirectoryUsers()}
                disabled={adImporting || selectedAdUsers.length === 0}
              >
                {adImporting
                  ? "Importing…"
                  : `Import ${selectedAdUsers.length || ""} selected user${selectedAdUsers.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <TabsRoot defaultValue="departments">
        <TabsList className="w-full justify-start border-b border-border bg-transparent rounded-none p-0 h-auto mb-6">
          <TabsTrigger
            value="departments"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Departments
          </TabsTrigger>
          <TabsTrigger
            value="roles"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            <Network className="mr-2 h-4 w-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            <UsersRound className="mr-2 h-4 w-4" />
            Members
          </TabsTrigger>
           <TabsTrigger
             value="matrix"
             className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
           >
             <Grid2X2 className="mr-2 h-4 w-4" />
             Matrix
           </TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedDepartments.map((department) => (
              <Card key={department.id} className="h-full">
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <CardTitle className="text-lg">{department.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${department.name}`}
                    onClick={() => openDepartment(department)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <PersonLine
                    label="Service Head"
                    member={department.serviceHead}
                    primary
                  />
                  {department.serviceHeadDeputy && (
                    <PersonLine
                      label="Deputy"
                      member={department.serviceHeadDeputy}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedRoles.map((role) => (
              <Card key={role.id}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <div className="text-xs font-mono text-muted-foreground mb-1">
                      {(role.departmentIds?.length
                        ? role.departmentIds
                        : [role.departmentId]
                      )
                        .map(
                          (id) => departments?.find((d) => d.id === id)?.name,
                        )
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <CardTitle className="text-lg">{role.name}</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${role.name}`}
                    onClick={() => openRole(role)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <PersonLine label="Role Lead" member={role.lead} primary />
                  {role.deputy && (
                    <PersonLine label="Deputy" member={role.deputy} />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {role.memberCount} role member
                    {role.memberCount === 1 ? "" : "s"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="members">
          {memberActionError && (
            <div className="mb-3 rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {memberActionError}
            </div>
          )}
          {memberActionMessage && (
            <div className="mb-3 rounded-sm border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {memberActionMessage}
            </div>
          )}
          <Card>
            <div className="divide-y divide-border">
              {sortedMembers.map((member) => {
                const assignedRoles = sortedRoles.filter(
                  (role) =>
                    role.lead.id === member.id ||
                    role.deputy?.id === member.id ||
                    (role.memberIds ?? []).includes(member.id),
                );
                const isExpanded = expandedRoleMembers.has(member.id);
                return (
                  <React.Fragment key={member.id}>
                    <div className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-muted text-foreground border">
                          {member.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-semibold truncate">{member.name}</span>
                        <span className="text-sm text-muted-foreground truncate">
                          {member.title || "Member"}
                        </span>
                      </div>
                      <div className="hidden sm:block text-sm text-muted-foreground font-mono truncate">
                        {member.email}
                      </div>
                      <div className="hidden sm:block text-sm font-medium">
                        <span className="text-muted-foreground text-xs uppercase mr-1">
                          BAU:
                        </span>
                        {(member.dailyBusinessPercent ?? 0)}%
                        {member.dailyBusinessTasks.length > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({member.dailyBusinessTasks.map((task) => task.name).join(", ")})
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`${isExpanded ? "Hide" : "Show"} role cases for ${member.name}`}
                        aria-expanded={isExpanded}
                        disabled={!assignedRoles.length}
                        onClick={() =>
                          setExpandedRoleMembers((current) => {
                            const next = new Set(current);
                            if (next.has(member.id)) next.delete(member.id);
                            else next.add(member.id);
                            return next;
                          })
                        }
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${member.name}`}
                        onClick={() => openMember(member)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Delete ${member.name}`}
                        onClick={() => void deleteMember(member)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {isExpanded && (
                      <div className="space-y-3 bg-muted/20 px-6 py-4 sm:pl-20">
                        {assignedRoles.map((role) => {
                          const otherMemberIds = [
                            role.deputy?.id,
                            ...(role.memberIds ?? []),
                          ].filter(
                            (id, index, ids): id is string =>
                              Boolean(id) &&
                              id !== role.lead.id &&
                              ids.indexOf(id) === index,
                          );
                          const otherMembers = otherMemberIds
                            .map((id) => sortedMembers.find((candidate) => candidate.id === id))
                            .filter((candidate): candidate is NonNullable<typeof candidate> =>
                              Boolean(candidate),
                            );
                          return (
                            <div key={role.id} className="rounded-md border bg-background p-3">
                              <h3 className="text-sm font-semibold">{role.name}</h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Assigned members besides the role lead
                              </p>
                              {otherMembers.length ? (
                                <ul className="mt-2 flex flex-wrap gap-2">
                                  {otherMembers.map((assignedMember) => (
                                    <li
                                      key={assignedMember.id}
                                      className="rounded-full bg-muted px-2.5 py-1 text-xs"
                                    >
                                      {assignedMember.name}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  No other assigned members.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="matrix" className="space-y-4">
          <DirectoryMatrix
            members={sortedMembers as MatrixMember[]}
            roles={sortedRoles as MatrixRole[]}
          />
        </TabsContent>
      </TabsRoot>

      <Dialog
        open={memberDialog.open}
        onOpenChange={(open) => setMemberDialog({ open })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {memberDialog.id ? "Edit member" : "Create member"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitMember} className="space-y-4">
            <Field label="Name">
              <Input
                required
                value={memberDraft.name}
                onChange={(e) =>
                  setMemberDraft({ ...memberDraft, name: e.target.value })
                }
              />
            </Field>
            <Field label="Email">
              <Input
                required
                type="email"
                value={memberDraft.email}
                onChange={(e) =>
                  setMemberDraft({ ...memberDraft, email: e.target.value })
                }
              />
            </Field>
            {!memberDialog.id && (
              <Field label="Account type">
                <Select
                  value={memberDraft.accountType}
                  onValueChange={(value: "local" | "external") =>
                    setMemberDraft({ ...memberDraft, accountType: value, password: "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="external">External / Directory account</SelectItem>
                    <SelectItem value="local">Local account</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
            {!memberDialog.id && memberDraft.accountType === "local" && (
              <Field label="Initial password">
                <Input
                  required
                  minLength={12}
                  type="password"
                  autoComplete="new-password"
                  value={memberDraft.password}
                  onChange={(e) => setMemberDraft({ ...memberDraft, password: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Use at least 12 characters. This password is only sent when creating a local account.
                </p>
              </Field>
            )}
            <Field label="Title">
              <Input
                value={memberDraft.title}
                onChange={(e) =>
                  setMemberDraft({ ...memberDraft, title: e.target.value })
                }
              />
            </Field>
            {memberDraft.accountType === "external" && <Field label="AD/identity subject (optional)">
              <Input
                value={memberDraft.externalSubject}
                onChange={(e) =>
                  setMemberDraft({
                    ...memberDraft,
                    externalSubject: e.target.value,
                  })
                }
              />
            </Field>}
            <Field label="Daily Business Tasks (BAU)">
              <div className="space-y-2">
                {memberDraft.dailyBusinessTasks.length === 0 ? (
                  <p className="rounded-sm border border-dashed p-3 text-sm text-muted-foreground">
                    No BAU tasks added.
                  </p>
                ) : (
                  memberDraft.dailyBusinessTasks.map((task, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        data-testid={`input-bau-task-name-${index}`}
                        aria-label={`BAU task ${index + 1} name`}
                        placeholder="Task name"
                        value={task.name}
                        onChange={(e) => {
                          const dailyBusinessTasks = [...memberDraft.dailyBusinessTasks];
                          dailyBusinessTasks[index] = { ...task, name: e.target.value };
                          setMemberDraft({ ...memberDraft, dailyBusinessTasks });
                        }}
                      />
                      <Input
                        data-testid={`input-bau-task-percent-${index}`}
                        aria-label={`${task.name || `BAU task ${index + 1}`} percentage`}
                        className="w-20"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={task.percent}
                        onChange={(e) => {
                          const dailyBusinessTasks = [...memberDraft.dailyBusinessTasks];
                          dailyBusinessTasks[index] = { ...task, percent: Number(e.target.value) };
                          setMemberDraft({ ...memberDraft, dailyBusinessTasks });
                        }}
                      />
                      <span className="text-muted-foreground">%</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove BAU task ${task.name || index + 1}`}
                        onClick={() =>
                          setMemberDraft({
                            ...memberDraft,
                            dailyBusinessTasks: memberDraft.dailyBusinessTasks.filter((_, taskIndex) => taskIndex !== index),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setMemberDraft({
                        ...memberDraft,
                        dailyBusinessTasks: [...memberDraft.dailyBusinessTasks, { name: "", percent: 0 }],
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add task
                  </Button>
                  <span className={`text-sm font-medium ${memberDraft.dailyBusinessTasks.reduce((sum, task) => sum + (Number(task.percent) || 0), 0) > 100 ? "text-destructive" : "text-muted-foreground"}`}>
                    Total: {memberDraft.dailyBusinessTasks.reduce((sum, task) => sum + (Number(task.percent) || 0), 0)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Names must be unique; percentages must total 100% or less.</p>
              </div>
            </Field>
            {canManageCio && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={memberDraft.isCio}
                  onChange={(e) =>
                    setMemberDraft({ ...memberDraft, isCio: e.target.checked })
                  }
                />
                CIO break-glass authority
              </label>
            )}
            {canManageCio && (
              <Field label="Department assignments">
                <div className="space-y-3 rounded-sm border p-3">
                  <p className="text-xs text-muted-foreground">
                    A department cannot remove its only head without choosing a replacement; the backend will reject that change.
                  </p>
                  {sortedDepartments.map((department) => (
                    <div key={department.id} className="grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={memberDraft.headDepartmentIds.includes(department.id)}
                          onChange={(e) =>
                            setMemberDraft({
                              ...memberDraft,
                              headDepartmentIds: e.target.checked
                                ? [...memberDraft.headDepartmentIds, department.id]
                                : memberDraft.headDepartmentIds.filter((id) => id !== department.id),
                              deputyDepartmentIds: e.target.checked
                                ? memberDraft.deputyDepartmentIds.filter((id) => id !== department.id)
                                : memberDraft.deputyDepartmentIds,
                            })
                          }
                        />
                        Head: {department.name}
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={memberDraft.deputyDepartmentIds.includes(department.id)}
                          onChange={(e) =>
                            setMemberDraft({
                              ...memberDraft,
                              deputyDepartmentIds: e.target.checked
                                ? [...memberDraft.deputyDepartmentIds, department.id]
                                : memberDraft.deputyDepartmentIds.filter((id) => id !== department.id),
                              headDepartmentIds: e.target.checked
                                ? memberDraft.headDepartmentIds.filter((id) => id !== department.id)
                                : memberDraft.headDepartmentIds,
                            })
                          }
                        />
                        Deputy: {department.name}
                      </label>
                    </div>
                  ))}
                </div>
              </Field>
            )}
            {memberDialog.id &&
              canResetLocalPassword &&
              (members?.find((member) => member.id === memberDialog.id) as
                | (NonNullable<typeof members>[number] & { authProvider?: string | null })
                | undefined)?.authProvider === "local" && (
                <div className="space-y-2 rounded-sm border border-dashed p-3">
                  <Label>Reset local account password</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      minLength={12}
                      autoComplete="new-password"
                      placeholder="At least 12 characters"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const member = members?.find((item) => item.id === memberDialog.id);
                        if (member) void resetMemberPassword(member);
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              )}
            {memberActionError && (
              <p className="text-sm text-destructive">{memberActionError}</p>
            )}
            {memberActionMessage && (
              <p className="text-sm text-emerald-700">{memberActionMessage}</p>
            )}
            <MutationError
              error={
                mutationError(createMember.error) ??
                mutationError(updateMember.error)
              }
            />
            <Button
              className="w-full"
              disabled={createMember.isPending || updateMember.isPending}
            >
              {createMember.isPending || updateMember.isPending
                ? "Saving…"
                : "Save member"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={departmentDialog.open}
        onOpenChange={(open) => setDepartmentDialog({ open })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {departmentDialog.id ? "Edit department" : "Create department"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitDepartment} className="space-y-4">
            <Field label="Department name">
              <Input
                required
                value={departmentDraft.name}
                onChange={(e) =>
                  setDepartmentDraft({
                    ...departmentDraft,
                    name: e.target.value,
                  })
                }
              />
            </Field>
            <MemberSelect
              label="Service Head"
              value={departmentDraft.serviceHeadId}
              onChange={(value) =>
                setDepartmentDraft({ ...departmentDraft, serviceHeadId: value })
              }
              members={sortedMembers}
              required
            />
            <p className="text-xs text-muted-foreground">
              The department editor cannot remove its only head without choosing a replacement; the backend will reject that change.
            </p>
            <MemberSelect
              label="Deputy (optional)"
              value={departmentDraft.serviceHeadDeputyId}
              onChange={(value) =>
                setDepartmentDraft({
                  ...departmentDraft,
                  serviceHeadDeputyId: value,
                })
              }
              members={sortedMembers}
            />
            <MutationError
              error={
                mutationError(createDepartment.error) ??
                mutationError(updateDepartment.error)
              }
            />
            <Button
              className="w-full"
              disabled={
                createDepartment.isPending || updateDepartment.isPending
              }
            >
              {createDepartment.isPending || updateDepartment.isPending
                ? "Saving…"
                : "Save department"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={roleDialog.open}
        onOpenChange={(open) => setRoleDialog({ open })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {roleDialog.id ? "Edit role" : "Create role"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitRole} className="space-y-4">
            <Field label="Role name">
              <Input
                required
                value={roleDraft.name}
                onChange={(e) =>
                  setRoleDraft({ ...roleDraft, name: e.target.value })
                }
              />
            </Field>
            <Field label="Primary department">
              <Select
                value={roleDraft.departmentId}
                onValueChange={(value) =>
                  setRoleDraft({
                    ...roleDraft,
                    departmentId: value,
                    departmentIds: [
                      ...new Set([value, ...roleDraft.departmentIds]),
                    ],
                    leadId: "",
                    deputyId: "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {sortedDepartments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Also linked to departments">
              <div className="max-h-32 space-y-2 overflow-y-auto rounded-sm border p-2">
                {sortedDepartments.map((department) => (
                  <label
                    key={department.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={roleDraft.departmentIds.includes(department.id)}
                      disabled={department.id === roleDraft.departmentId}
                      onChange={(event) =>
                        setRoleDraft({
                          ...roleDraft,
                          departmentIds: event.target.checked
                            ? [...roleDraft.departmentIds, department.id]
                            : roleDraft.departmentIds.filter(
                                (id) => id !== department.id,
                              ),
                        })
                      }
                    />
                    {department.name}
                    {department.id === roleDraft.departmentId && (
                      <span className="text-xs text-muted-foreground">
                        (primary)
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </Field>
            <MemberSelect
              label="Role Lead"
              value={roleDraft.leadId}
              onChange={(value) =>
                setRoleDraft({ ...roleDraft, leadId: value })
              }
              members={sortedMembers}
              required
            />
            <MemberSelect
              label="Deputy (optional)"
              value={roleDraft.deputyId}
              onChange={(value) =>
                setRoleDraft({ ...roleDraft, deputyId: value })
              }
              members={sortedMembers}
            />
            <Field label="Role members (optional)">
              <div className="max-h-36 overflow-y-auto rounded-sm border p-2 space-y-2">
                {sortedMembers.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={roleDraft.memberIds.includes(member.id)}
                      onChange={(e) =>
                        setRoleDraft({
                          ...roleDraft,
                          memberIds: e.target.checked
                            ? [...roleDraft.memberIds, member.id]
                            : roleDraft.memberIds.filter(
                                (id) => id !== member.id,
                              ),
                        })
                      }
                    />
                    {member.name}
                  </label>
                ))}
              </div>
            </Field>
            <MutationError
              error={
                mutationError(createRole.error) ??
                mutationError(updateRole.error)
              }
            />
            <Button
              className="w-full"
              disabled={createRole.isPending || updateRole.isPending}
            >
              {createRole.isPending || updateRole.isPending
                ? "Saving…"
                : "Save role"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function MemberSelect({
  label,
  value,
  onChange,
  members,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  members: Array<{ id: string; name: string }>;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <Select
        required={required}
        value={value || (required ? undefined : "none")}
        onValueChange={(next) => onChange(next === "none" ? "" : next)}
      >
        <SelectTrigger>
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {!required && <SelectItem value="none">Unassigned</SelectItem>}
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function PersonLine({
  label,
  member,
  primary,
}: {
  label: string;
  member: { initials: string; name: string; email: string };
  primary?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-mono">
        {label}
      </div>
      <div
        className={`flex items-center gap-3 p-2 rounded-sm border ${primary ? "bg-muted/50" : ""}`}
      >
        <Avatar
          className={`h-8 w-8 ${primary ? "bg-primary text-primary-foreground" : ""}`}
        >
          <AvatarFallback>{member.initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">{member.name}</span>
          <span className="text-xs text-muted-foreground truncate">
            {member.email}
          </span>
        </div>
      </div>
    </div>
  );
}

function MutationError({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-destructive">{error}</p> : null;
}
