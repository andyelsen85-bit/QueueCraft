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
} from "lucide-react";
import { jsPDF } from "jspdf";

type MemberDraft = {
  name: string;
  email: string;
  title: string;
  externalSubject: string;
  isCio: boolean;
  dailyBusinessPercent: number;
};

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
  isCio: false,
  dailyBusinessPercent: 0,
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
  const memberColumnWidth = 126;
  const roleColumnWidth = 58;
  const rowHeight = 21;
  const headerHeight = 44;
  const availableWidth = pageWidth - margin * 2 - memberColumnWidth;
  const rolesPerPage = Math.max(1, Math.floor(availableWidth / roleColumnWidth));
  const rowsPerPage = Math.max(
    1,
    Math.floor((pageHeight - 83 - headerHeight - 50) / rowHeight),
  );
  const rolePages = Math.max(1, Math.ceil(roles.length / rolesPerPage));
  const rowPages = Math.max(1, Math.ceil(members.length / rowsPerPage));
  const totalPages = rolePages * rowPages;
  const generatedDate = new Date();
  const generated = [
    String(generatedDate.getDate()).padStart(2, "0"),
    String(generatedDate.getMonth() + 1).padStart(2, "0"),
    generatedDate.getFullYear(),
  ].join("/");
  let pageNumber = 0;

  for (let rowPage = 0; rowPage < rowPages; rowPage += 1) {
    const pageMembers = members.slice(
      rowPage * rowsPerPage,
      (rowPage + 1) * rowsPerPage,
    );
    for (let rolePage = 0; rolePage < rolePages; rolePage += 1) {
      if (pageNumber > 0) pdf.addPage();
      pageNumber += 1;
      const pageRoles = roles.slice(
        rolePage * rolesPerPage,
        (rolePage + 1) * rolesPerPage,
      );
      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, pageWidth, 66, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("QueueCraft", margin, 27);
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.text("Directory member-by-role matrix", margin, 46);
      pdf.setFontSize(9);
      pdf.text(generated, pageWidth - margin, 27, { align: "right" });
      pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, 46, {
        align: "right",
      });

      const tableTop = 83;
      const tableWidth = memberColumnWidth + pageRoles.length * roleColumnWidth;
      pdf.setFillColor(241, 245, 249);
      pdf.rect(margin, tableTop, tableWidth, headerHeight, "F");
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.6);
      pdf.rect(margin, tableTop, tableWidth, headerHeight + pageMembers.length * rowHeight);
      pdf.setTextColor(30, 41, 59);
      pdf.setFont("helvetica", "bold");
      pdf.text("MEMBER", margin + 8, tableTop + 23);
      pageRoles.forEach((role, index) => {
        const x = margin + memberColumnWidth + index * roleColumnWidth;
        pdf.line(x, tableTop, x, tableTop + headerHeight + pageMembers.length * rowHeight);
        const lines = pdf.splitTextToSize(role.name, roleColumnWidth - 8).slice(0, 3);
        pdf.setFontSize(lines.length > 2 ? 6.5 : 7.5);
        pdf.text(lines, x + roleColumnWidth / 2, tableTop + 12, {
          align: "center",
        });
      });
      pdf.line(
        margin + memberColumnWidth,
        tableTop,
        margin + memberColumnWidth,
        tableTop + headerHeight + pageMembers.length * rowHeight,
      );
      pageMembers.forEach((member, memberIndex) => {
        const y = tableTop + headerHeight + memberIndex * rowHeight;
        if (memberIndex % 2 === 0) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(margin, y, tableWidth, rowHeight, "F");
        }
        pdf.setDrawColor(226, 232, 240);
        pdf.line(margin, y, margin + tableWidth, y);
        pdf.setTextColor(51, 65, 85);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(pdf.splitTextToSize(member.name, memberColumnWidth - 14)[0], margin + 8, y + 14);
        pageRoles.forEach((role, roleIndex) => {
          const x = margin + memberColumnWidth + roleIndex * roleColumnWidth;
          const isLead = role.lead.id === member.id;
          const isDeputy = role.deputy?.id === member.id;
          const isMember = (role.memberIds ?? []).includes(member.id);
          if (!isLead && !isDeputy && !isMember) return;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(isLead ? 185 : 15, isLead ? 28 : 23, isLead ? 28 : 42);
          pdf.text(isLead ? "X!" : "X", x + roleColumnWidth / 2, y + 14, {
            align: "center",
          });
        });
      });
      const legendY = Math.min(
        pageHeight - 25,
        tableTop + headerHeight + pageMembers.length * rowHeight + 18,
      );
      pdf.setFontSize(8);
      pdf.setTextColor(71, 85, 105);
      pdf.setFont("helvetica", "normal");
      pdf.text("Legend:", margin, legendY);
      pdf.setTextColor(15, 23, 42);
      pdf.text("X = member", margin + 38, legendY);
      pdf.setTextColor(185, 28, 28);
      pdf.text("X! = role lead", margin + 104, legendY);
      if (rolePages > 1 || rowPages > 1) {
        pdf.setTextColor(100, 116, 139);
        pdf.text(
          `Showing roles ${rolePage * rolesPerPage + 1}–${Math.min(
            roles.length,
            (rolePage + 1) * rolesPerPage,
          )} and members ${rowPage * rowsPerPage + 1}–${Math.min(
            members.length,
            (rowPage + 1) * rowsPerPage,
          )}`,
          pageWidth - margin,
          legendY,
          { align: "right" },
        );
      }
    }
  }
  pdf.save(`queuecraft-directory-matrix-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function DirectoryMatrix({ members, roles }: DirectoryMatrixProps) {
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
        <div className="overflow-auto rounded-md border">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60">
                <th className="sticky left-0 z-10 min-w-48 border-b border-r bg-muted/90 px-4 py-3 text-left font-semibold">
                  Member
                </th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    className="min-w-24 max-w-32 border-b px-3 py-3 text-center font-semibold"
                    title={role.name}
                  >
                    <span className="line-clamp-2">{role.name}</span>
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
                    <td key={role.id} className="border-t px-3 py-3 text-center">
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
    session?.capabilities?.includes("directory.manage_cio") ?? false;
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

  const invalidateDirectory = () => {
    queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
  };

  const openMember = (member?: NonNullable<typeof members>[number]) => {
    setMemberDraft(
      member
        ? {
            name: member.name,
            email: member.email,
            title: member.title ?? "",
            externalSubject:
              (member as typeof member & { externalSubject?: string | null })
                .externalSubject ?? "",
            isCio: Boolean(
              (member as typeof member & { isCio?: boolean }).isCio,
            ),
            dailyBusinessPercent: member.dailyBusinessPercent ?? 0,
          }
        : emptyMember,
    );
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
    const data = {
      name: memberDraft.name.trim(),
      email: memberDraft.email.trim(),
      title: memberDraft.title.trim() || null,
      externalSubject: memberDraft.externalSubject.trim() || null,
      ...(canManageCio ? { isCio: memberDraft.isCio } : {}),
      dailyBusinessPercent: memberDraft.dailyBusinessPercent,
    };
    try {
      if (memberDialog.id)
        await updateMember.mutateAsync({ memberId: memberDialog.id, data });
      else await createMember.mutateAsync({ data });
      setMemberDialog({ open: false });
      invalidateDirectory();
    } catch {}
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
          <Card>
            <div className="divide-y divide-border">
              {sortedMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-muted text-foreground border">
                      {member.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-semibold truncate">
                      {member.name}
                    </span>
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
                    {member.dailyBusinessPercent ?? 0}%
                  </div>
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
              ))}
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
            <Field label="Title">
              <Input
                value={memberDraft.title}
                onChange={(e) =>
                  setMemberDraft({ ...memberDraft, title: e.target.value })
                }
              />
            </Field>
            <Field label="AD/identity subject (optional)">
              <Input
                value={memberDraft.externalSubject}
                onChange={(e) =>
                  setMemberDraft({
                    ...memberDraft,
                    externalSubject: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Daily Business Percent (BAU)">
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={memberDraft.dailyBusinessPercent}
                  onChange={(e) =>
                    setMemberDraft({
                      ...memberDraft,
                      dailyBusinessPercent: Number(e.target.value),
                    })
                  }
                />
                <span className="text-muted-foreground">%</span>
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
