import type { Department, Role } from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Routing = { departmentId: string; roleId: string };

export function TopicRoutingFields({
  departmentId, roleId, departments, roles, onChange, allowUnassigned = false,
}: Routing & {
  departments: Department[];
  roles: Role[];
  onChange: (routing: Routing) => void;
  allowUnassigned?: boolean;
}) {
  const belongsTo = (role: Role, id: string) =>
    role.departmentId === id || role.departmentIds?.includes(id);
  const sortedDepartments = [...departments].sort((a, b) => a.name.localeCompare(b.name));
  const filteredRoles = roles.filter((role) => belongsTo(role, departmentId))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Department{allowUnassigned ? " (optional)" : " (required)"}</Label>
        <Select value={departmentId || (allowUnassigned ? "__unassigned__" : "")} onValueChange={(value) => {
          const nextDepartment = value === "__unassigned__" ? "" : value;
          const currentRole = roles.find((role) => role.id === roleId);
          onChange({
            departmentId: nextDepartment,
            roleId: currentRole && belongsTo(currentRole, nextDepartment) ? roleId : "",
          });
        }}>
          <SelectTrigger aria-label="Department"><SelectValue placeholder="Select department" /></SelectTrigger>
          <SelectContent>
            {allowUnassigned && <SelectItem value="__unassigned__">Not assigned</SelectItem>}
            {sortedDepartments.map((department) =>
              <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Role{allowUnassigned ? " (optional)" : " (required)"}</Label>
        <Select value={roleId || (allowUnassigned ? "__unassigned__" : "")} disabled={!departmentId}
          onValueChange={(value) => onChange({
            departmentId, roleId: value === "__unassigned__" ? "" : value,
          })}>
          <SelectTrigger aria-label="Role"><SelectValue placeholder="Select role" /></SelectTrigger>
          <SelectContent>
            {allowUnassigned && <SelectItem value="__unassigned__">Not assigned</SelectItem>}
            {filteredRoles.map((role) =>
              <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {departmentId && !filteredRoles.length &&
          <p className="text-xs text-muted-foreground">No active roles are linked to this department.</p>}
      </div>
    </div>
  );
}
