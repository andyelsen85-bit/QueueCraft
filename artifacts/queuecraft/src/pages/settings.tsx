import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LockKeyhole, Mail, Network, ShieldCheck, Server } from "lucide-react"

type Status = {
  publicBaseUrl: string | null
  adfs: { enabled: boolean; issuer: string | null; clientId: string | null; clientSecretConfigured: boolean; caCertificateConfigured: boolean; redirectUri: string | null }
  ldaps: { url: string | null; bindDn: string | null; bindPasswordConfigured: boolean; baseDn: string | null; userFilter: string; caCertificateConfigured: boolean }
  smtp: { host: string | null; port: number; secure: boolean; user: string | null; passwordConfigured: boolean; from: string | null }
}
type Draft = Record<string, string | number | boolean>

export function SettingsPage() {
  const [status, setStatus] = React.useState<Status | null>(null)
  const [draft, setDraft] = React.useState<Draft>({})
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const load = React.useCallback(async () => {
    const response = await fetch("/api/admin/settings", { credentials: "include" })
    if (!response.ok) { setMessage(response.status === 403 ? "Only CIO administrators can manage runtime settings." : "Settings could not be loaded."); return }
    const next = await response.json() as Status
    setStatus(next)
    setDraft({
      publicBaseUrl: next.publicBaseUrl ?? "", adfsEnabled: next.adfs.enabled, adfsIssuer: next.adfs.issuer ?? "", adfsClientId: next.adfs.clientId ?? "",
      ldapsUrl: next.ldaps.url ?? "", ldapsBindDn: next.ldaps.bindDn ?? "", ldapsBaseDn: next.ldaps.baseDn ?? "", ldapsUserFilter: next.ldaps.userFilter ?? "",
      smtpHost: next.smtp.host ?? "", smtpPort: next.smtp.port ?? 587, smtpSecure: next.smtp.secure, smtpUser: next.smtp.user ?? "", smtpFrom: next.smtp.from ?? "",
    })
  }, [])
  React.useEffect(() => { void load() }, [load])
  const set = (key: string, value: string | number | boolean) => setDraft((current) => ({ ...current, [key]: value }))
  const save = async () => {
    setSaving(true); setMessage("")
    try {
      const csrf = await fetch("/api/auth/csrf", { credentials: "include" }).then((response) => response.json())
      const response = await fetch("/api/admin/settings", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.csrfToken }, body: JSON.stringify(draft) })
      if (!response.ok) throw new Error((await response.json()).error ?? "Settings could not be saved")
      setStatus(await response.json()); setDraft((current) => ({ ...current, adfsClientSecret: "", ldapsBindPassword: "", ldapsCaCertificate: "", smtpPassword: "" })); setMessage("Settings saved. Authentication and mail services use the updated configuration for new requests.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Settings could not be saved") } finally { setSaving(false) }
  }
  if (!status) return <div className="p-8 text-sm text-muted-foreground">{message || "Loading settings…"}</div>
  return <div className="flex-1 space-y-6 p-8">
    <div><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Platform administration</p><h1 className="text-3xl font-bold tracking-tight">Settings</h1><p className="mt-1 text-muted-foreground">Configure QueueCraft’s runtime integrations directly in the application.</p></div>
    <Card className="border-primary/30 bg-primary/5"><CardHeader className="flex-row items-start gap-3 space-y-0"><LockKeyhole className="mt-0.5 h-5 w-5 text-primary" /><div><CardTitle className="text-base">Encrypted credentials</CardTitle><CardDescription className="mt-1">Passwords, client secrets, and LDAPS CA certificates are encrypted before storage and are never returned to this page. Leave a secret field blank to retain its current value.</CardDescription></div></CardHeader></Card>
    <div className="grid gap-4 lg:grid-cols-2">
       <Section icon={ShieldCheck} title="AD FS / OpenID Connect"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.adfsEnabled)} onChange={(event) => set("adfsEnabled", event.target.checked)} />Enable AD FS single sign-on</label><Text label="Issuer URL" value={draft.adfsIssuer} onChange={(v) => set("adfsIssuer", v)} /><Text label="Client ID" value={draft.adfsClientId} onChange={(v) => set("adfsClientId", v)} /><Secret label="Client secret" configured={status.adfs.clientSecretConfigured} onChange={(v) => set("adfsClientSecret", v)} /><Secret label="CA certificate (PEM)" configured={status.adfs.caCertificateConfigured} onChange={(v) => set("adfsCaCertificate", v)} /><p className="text-xs text-muted-foreground">Redirect URL: {status.adfs.redirectUri ?? "Set Public base URL below first."}</p></Section>
       <Section icon={Network} title="LDAPS / Active Directory"><Text label="LDAPS URL" value={draft.ldapsUrl} onChange={(v) => set("ldapsUrl", v)} /><Text label="Bind DN" value={draft.ldapsBindDn} onChange={(v) => set("ldapsBindDn", v)} /><Secret label="Bind password" configured={status.ldaps.bindPasswordConfigured} onChange={(v) => set("ldapsBindPassword", v)} /><Text label="Base DN" value={draft.ldapsBaseDn} onChange={(v) => set("ldapsBaseDn", v)} /><Text label="User filter" value={draft.ldapsUserFilter} onChange={(v) => set("ldapsUserFilter", v)} /><Secret label="CA certificate (PEM)" configured={status.ldaps.caCertificateConfigured} onChange={(v) => set("ldapsCaCertificate", v)} /><p className="text-xs text-muted-foreground">Use this connection to import allowed users from Active Directory. It is not an interactive login provider.</p></Section>
      <Section icon={Mail} title="SMTP"><Text label="Host" value={draft.smtpHost} onChange={(v) => set("smtpHost", v)} /><Text label="Port" type="number" value={draft.smtpPort} onChange={(v) => set("smtpPort", Number(v))} /><Text label="From address" value={draft.smtpFrom} onChange={(v) => set("smtpFrom", v)} /><Text label="Username" value={draft.smtpUser} onChange={(v) => set("smtpUser", v)} /><Secret label="Password" configured={status.smtp.passwordConfigured} onChange={(v) => set("smtpPassword", v)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.smtpSecure)} onChange={(event) => set("smtpSecure", event.target.checked)} />Use TLS from connection start</label></Section>
      <Section icon={Server} title="Application"><Text label="Public base URL" value={draft.publicBaseUrl} onChange={(v) => set("publicBaseUrl", v)} /><p className="text-sm text-muted-foreground">Session signing is protected by the deployment bootstrap secret and cannot be changed while users are signed in.</p></Section>
    </div>
    {message && <p className="text-sm text-muted-foreground">{message}</p>}
    <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
  </div>
}
function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) { return <Card><CardHeader className="flex-row items-center gap-3 space-y-0"><Icon className="h-5 w-5 text-primary" /><CardTitle className="text-lg">{title}</CardTitle></CardHeader><CardContent className="space-y-3">{children}</CardContent></Card> }
function Text({ label, value, onChange, type = "text" }: { label: string; value: string | number | boolean | undefined; onChange: (value: string) => void; type?: string }) { return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={typeof value === "boolean" ? "" : value ?? ""} onChange={(event) => onChange(event.target.value)} /></div> }
function Secret({ label, configured, onChange }: { label: string; configured: boolean; onChange: (value: string) => void }) { return <div className="space-y-1"><Label>{label} {configured && <span className="text-xs text-green-600">(configured)</span>}</Label><Input type="password" autoComplete="new-password" placeholder={configured ? "Leave blank to keep existing value" : "Enter value"} onChange={(event) => onChange(event.target.value)} /></div> }