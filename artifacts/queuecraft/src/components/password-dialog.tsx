import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [oldPassword, setOldPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const submit = async () => {
    setError("")
    if (newPassword.length < 12) { setError("New password must be at least 12 characters"); return }
    if (newPassword !== confirm) { setError("New passwords do not match"); return }
    setSaving(true)
    try {
      const csrf = await fetch("/api/auth/csrf").then((response) => response.json())
      const response = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.csrfToken },
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      if (!response.ok) { setError((await response.json()).error ?? "Unable to update password"); return }
      setOldPassword(""); setNewPassword(""); setConfirm("")
      onOpenChange(false)
    } catch { setError("Unable to update password") } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Choose a password with at least 12 characters.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="old-password">Current password</Label><Input id="old-password" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void submit()} disabled={saving}>{saving ? "Saving..." : "Save password"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}