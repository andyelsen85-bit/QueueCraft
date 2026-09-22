import * as React from "react"
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
  getListDepartmentsQueryKey,
  getListRolesQueryKey,
  getListMembersQueryKey,
} from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, UsersRound, ShieldCheck, Network } from "lucide-react"

type MemberDraft = {
  name: string
  email: string
  title: string
  externalSubject: string
  isCio: boolean
  dailyBusinessPercent: number
}

type DepartmentDraft = {
  name: string
  serviceHeadId: string
  serviceHeadDeputyId: string
}

type RoleDraft = {
  name: string
  departmentId: string
  departmentIds: string[]
  leadId: string
  deputyId: string
  memberIds: string[]
}

const emptyMember: MemberDraft = { name: "", email: "", title: "", externalSubject: "", isCio: false, dailyBusinessPercent: 0 }
const emptyDepartment: DepartmentDraft = { name: "", serviceHeadId: "", serviceHeadDeputyId: "" }
const emptyRole: RoleDraft = { name: "", departmentId: "", departmentIds: [], leadId: "", deputyId: "", memberIds: [] }

function mutationError(error: unknown) {
  if (!error) return null
  return error instanceof Error ? error.message : "The change could not be saved."
}

export function Directory() {
  const queryClient = useQueryClient()
  const { data: departments, isLoading: ld, isError: de } = useListDepartments()
  const { data: roles, isLoading: lr, isError: re } = useListRoles()
  const { data: members, isLoading: lm, isError: me } = useListMembers()
  const createDepartment = useCreateDepartment()
  const updateDepartment = useUpdateDepartment()
  const createRole = useCreateRole()
  const updateRole = useUpdateRole()
  const createMember = useCreateMember()
  const updateMember = useUpdateMember()

  const [memberDialog, setMemberDialog] = React.useState<{ open: boolean; id?: string }>({ open: false })
  const [departmentDialog, setDepartmentDialog] = React.useState<{ open: boolean; id?: string }>({ open: false })
  const [roleDialog, setRoleDialog] = React.useState<{ open: boolean; id?: string }>({ open: false })
  const [memberDraft, setMemberDraft] = React.useState(emptyMember)
  const [departmentDraft, setDepartmentDraft] = React.useState(emptyDepartment)
  const [roleDraft, setRoleDraft] = React.useState(emptyRole)

  const invalidateDirectory = () => {
    queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() })
    queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() })
    queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() })
  }

  const openMember = (member?: NonNullable<typeof members>[number]) => {
    setMemberDraft(member ? {
      name: member.name,
      email: member.email,
      title: member.title ?? "",
      externalSubject: (member as typeof member & { externalSubject?: string | null }).externalSubject ?? "",
      isCio: Boolean((member as typeof member & { isCio?: boolean }).isCio),
      dailyBusinessPercent: member.dailyBusinessPercent ?? 0,
    } : emptyMember)
    setMemberDialog({ open: true, id: member?.id })
  }

  const openDepartment = (department?: NonNullable<typeof departments>[number]) => {
    setDepartmentDraft(department ? {
      name: department.name,
      serviceHeadId: department.serviceHead.id,
      serviceHeadDeputyId: department.serviceHeadDeputy?.id ?? "",
    } : emptyDepartment)
    setDepartmentDialog({ open: true, id: department?.id })
  }

  const openRole = (role?: NonNullable<typeof roles>[number]) => {
    setRoleDraft(role ? {
      name: role.name,
      departmentId: role.departmentId,
      departmentIds: role.departmentIds?.length ? role.departmentIds : [role.departmentId],
      leadId: role.lead.id,
      deputyId: role.deputy?.id ?? "",
      memberIds: role.memberIds ?? [],
    } : emptyRole)
    setRoleDialog({ open: true, id: role?.id })
  }

  const submitMember = async (event: React.FormEvent) => {
    event.preventDefault()
    const data = {
      name: memberDraft.name.trim(),
      email: memberDraft.email.trim(),
      title: memberDraft.title.trim() || null,
      externalSubject: memberDraft.externalSubject.trim() || null,
      isCio: memberDraft.isCio,
      dailyBusinessPercent: memberDraft.dailyBusinessPercent,
    }
    try {
      if (memberDialog.id) await updateMember.mutateAsync({ memberId: memberDialog.id, data })
      else await createMember.mutateAsync({ data })
      setMemberDialog({ open: false })
      invalidateDirectory()
    } catch {}
  }

  const submitDepartment = async (event: React.FormEvent) => {
    event.preventDefault()
    const data = {
      name: departmentDraft.name.trim(),
      serviceHeadId: departmentDraft.serviceHeadId,
      serviceHeadDeputyId: departmentDraft.serviceHeadDeputyId || null,
    }
    try {
      if (departmentDialog.id) await updateDepartment.mutateAsync({ departmentId: departmentDialog.id, data })
      else await createDepartment.mutateAsync({ data })
      setDepartmentDialog({ open: false })
      invalidateDirectory()
    } catch {}
  }

  const submitRole = async (event: React.FormEvent) => {
    event.preventDefault()
    const data = {
      name: roleDraft.name.trim(),
      departmentId: roleDraft.departmentId,
      departmentIds: [...new Set([roleDraft.departmentId, ...roleDraft.departmentIds].filter(Boolean))],
      leadId: roleDraft.leadId,
      deputyId: roleDraft.deputyId || null,
      memberIds: roleDraft.memberIds,
    }
    try {
      if (roleDialog.id) await updateRole.mutateAsync({ roleId: roleDialog.id, data })
      else await createRole.mutateAsync({ data })
      setRoleDialog({ open: false })
      invalidateDirectory()
    } catch {}
  }

  const loading = ld || lr || lm
  const error = de || re || me
  const memberOptions = members ?? []

  if (loading) {
    return <div className="p-8 space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-10 w-full" /><Skeleton className="h-[500px] w-full" /></div>
  }

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Directory control</p>
          <h1 className="text-3xl font-bold tracking-tight">Organization Directory</h1>
          <p className="text-muted-foreground mt-1">Create the people and routing structure that powers validation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openMember()}><Plus className="mr-2 h-4 w-4" />Member</Button>
          <Button variant="outline" onClick={() => openDepartment()}><Plus className="mr-2 h-4 w-4" />Department</Button>
          <Button onClick={() => openRole()}><Plus className="mr-2 h-4 w-4" />Role</Button>
        </div>
      </div>
      {error && <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Directory data could not be loaded. Refresh and try again.</div>}
      <TabsRoot defaultValue="departments">
        <TabsList className="w-full justify-start border-b border-border bg-transparent rounded-none p-0 h-auto mb-6">
          <TabsTrigger value="departments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"><ShieldCheck className="mr-2 h-4 w-4" />Departments</TabsTrigger>
          <TabsTrigger value="roles" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"><Network className="mr-2 h-4 w-4" />Roles</TabsTrigger>
          <TabsTrigger value="members" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"><UsersRound className="mr-2 h-4 w-4" />Members</TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {departments?.map((department) => (
              <Card key={department.id} className="h-full">
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <CardTitle className="text-lg">{department.name}</CardTitle>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${department.name}`} onClick={() => openDepartment(department)}><Pencil className="h-4 w-4" /></Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <PersonLine label="Service Head" member={department.serviceHead} primary />
                  {department.serviceHeadDeputy && <PersonLine label="Deputy" member={department.serviceHeadDeputy} />}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {roles?.map((role) => (
              <Card key={role.id}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div><div className="text-xs font-mono text-muted-foreground mb-1">{(role.departmentIds?.length ? role.departmentIds : [role.departmentId]).map((id) => departments?.find((d) => d.id === id)?.name).filter(Boolean).join(" · ")}</div><CardTitle className="text-lg">{role.name}</CardTitle></div>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${role.name}`} onClick={() => openRole(role)}><Pencil className="h-4 w-4" /></Button>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <PersonLine label="Role Lead" member={role.lead} primary />
                  {role.deputy && <PersonLine label="Deputy" member={role.deputy} />}
                  <p className="text-xs text-muted-foreground">{role.memberCount} role member{role.memberCount === 1 ? "" : "s"}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <div className="divide-y divide-border">
              {members?.map((member) => (
                <div key={member.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
                  <Avatar className="h-10 w-10"><AvatarFallback className="bg-muted text-foreground border">{member.initials}</AvatarFallback></Avatar>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-semibold truncate">{member.name}</span>
                    <span className="text-sm text-muted-foreground truncate">{member.title || "Member"}</span>
                  </div>
                  <div className="hidden sm:block text-sm text-muted-foreground font-mono truncate">{member.email}</div>
                  <div className="hidden sm:block text-sm font-medium">
                    <span className="text-muted-foreground text-xs uppercase mr-1">BAU:</span>
                    {member.dailyBusinessPercent ?? 0}%
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${member.name}`} onClick={() => openMember(member)}><Pencil className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </TabsRoot>

      <Dialog open={memberDialog.open} onOpenChange={(open) => setMemberDialog({ open })}>
        <DialogContent><DialogHeader><DialogTitle>{memberDialog.id ? "Edit member" : "Create member"}</DialogTitle></DialogHeader>
          <form onSubmit={submitMember} className="space-y-4">
            <Field label="Name"><Input required value={memberDraft.name} onChange={(e) => setMemberDraft({ ...memberDraft, name: e.target.value })} /></Field>
            <Field label="Email"><Input required type="email" value={memberDraft.email} onChange={(e) => setMemberDraft({ ...memberDraft, email: e.target.value })} /></Field>
            <Field label="Title"><Input value={memberDraft.title} onChange={(e) => setMemberDraft({ ...memberDraft, title: e.target.value })} /></Field>
            <Field label="AD/identity subject (optional)"><Input value={memberDraft.externalSubject} onChange={(e) => setMemberDraft({ ...memberDraft, externalSubject: e.target.value })} /></Field>
            <Field label="Daily Business Percent (BAU)">
              <div className="flex items-center gap-4">
                <Input type="number" min="0" max="100" required value={memberDraft.dailyBusinessPercent} onChange={(e) => setMemberDraft({ ...memberDraft, dailyBusinessPercent: Number(e.target.value) })} />
                <span className="text-muted-foreground">%</span>
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={memberDraft.isCio} onChange={(e) => setMemberDraft({ ...memberDraft, isCio: e.target.checked })} />CIO break-glass authority</label>
            <MutationError error={mutationError(createMember.error) ?? mutationError(updateMember.error)} />
            <Button className="w-full" disabled={createMember.isPending || updateMember.isPending}>{createMember.isPending || updateMember.isPending ? "Saving…" : "Save member"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={departmentDialog.open} onOpenChange={(open) => setDepartmentDialog({ open })}>
        <DialogContent><DialogHeader><DialogTitle>{departmentDialog.id ? "Edit department" : "Create department"}</DialogTitle></DialogHeader>
          <form onSubmit={submitDepartment} className="space-y-4">
            <Field label="Department name"><Input required value={departmentDraft.name} onChange={(e) => setDepartmentDraft({ ...departmentDraft, name: e.target.value })} /></Field>
            <MemberSelect label="Service Head" value={departmentDraft.serviceHeadId} onChange={(value) => setDepartmentDraft({ ...departmentDraft, serviceHeadId: value })} members={memberOptions} required />
            <MemberSelect label="Deputy (optional)" value={departmentDraft.serviceHeadDeputyId} onChange={(value) => setDepartmentDraft({ ...departmentDraft, serviceHeadDeputyId: value })} members={memberOptions} />
            <MutationError error={mutationError(createDepartment.error) ?? mutationError(updateDepartment.error)} />
            <Button className="w-full" disabled={createDepartment.isPending || updateDepartment.isPending}>{createDepartment.isPending || updateDepartment.isPending ? "Saving…" : "Save department"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={roleDialog.open} onOpenChange={(open) => setRoleDialog({ open })}>
        <DialogContent><DialogHeader><DialogTitle>{roleDialog.id ? "Edit role" : "Create role"}</DialogTitle></DialogHeader>
          <form onSubmit={submitRole} className="space-y-4">
            <Field label="Role name"><Input required value={roleDraft.name} onChange={(e) => setRoleDraft({ ...roleDraft, name: e.target.value })} /></Field>
            <Field label="Primary department"><Select value={roleDraft.departmentId} onValueChange={(value) => setRoleDraft({ ...roleDraft, departmentId: value, departmentIds: [...new Set([value, ...roleDraft.departmentIds])], leadId: "", deputyId: "" })}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Also linked to departments"><div className="max-h-32 space-y-2 overflow-y-auto rounded-sm border p-2">{departments?.map((department) => <label key={department.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roleDraft.departmentIds.includes(department.id)} disabled={department.id === roleDraft.departmentId} onChange={(event) => setRoleDraft({ ...roleDraft, departmentIds: event.target.checked ? [...roleDraft.departmentIds, department.id] : roleDraft.departmentIds.filter((id) => id !== department.id) })} />{department.name}{department.id === roleDraft.departmentId && <span className="text-xs text-muted-foreground">(primary)</span>}</label>)}</div></Field>
            <MemberSelect label="Role Lead" value={roleDraft.leadId} onChange={(value) => setRoleDraft({ ...roleDraft, leadId: value })} members={memberOptions} required />
            <MemberSelect label="Deputy (optional)" value={roleDraft.deputyId} onChange={(value) => setRoleDraft({ ...roleDraft, deputyId: value })} members={memberOptions} />
            <Field label="Role members (optional)"><div className="max-h-36 overflow-y-auto rounded-sm border p-2 space-y-2">{memberOptions.map((member) => <label key={member.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roleDraft.memberIds.includes(member.id)} onChange={(e) => setRoleDraft({ ...roleDraft, memberIds: e.target.checked ? [...roleDraft.memberIds, member.id] : roleDraft.memberIds.filter((id) => id !== member.id) })} />{member.name}</label>)}</div></Field>
            <MutationError error={mutationError(createRole.error) ?? mutationError(updateRole.error)} />
            <Button className="w-full" disabled={createRole.isPending || updateRole.isPending}>{createRole.isPending || updateRole.isPending ? "Saving…" : "Save role"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>
}

function MemberSelect({ label, value, onChange, members, required }: { label: string; value: string; onChange: (value: string) => void; members: Array<{ id: string; name: string }>; required?: boolean }) {
  return <Field label={label}><Select required={required} value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger><SelectContent>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></Field>
}

function PersonLine({ label, member, primary }: { label: string; member: { initials: string; name: string; email: string }; primary?: boolean }) {
  return <div><div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-mono">{label}</div><div className={`flex items-center gap-3 p-2 rounded-sm border ${primary ? "bg-muted/50" : ""}`}><Avatar className={`h-8 w-8 ${primary ? "bg-primary text-primary-foreground" : ""}`}><AvatarFallback>{member.initials}</AvatarFallback></Avatar><div className="flex flex-col min-w-0"><span className="text-sm font-medium truncate">{member.name}</span><span className="text-xs text-muted-foreground truncate">{member.email}</span></div></div></div>
}

function MutationError({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-destructive">{error}</p> : null
}