import * as React from "react"
import { useGetSession } from "@workspace/api-client-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatabaseBackup, LockKeyhole, Mail, Network, ShieldCheck, Server, Upload } from "lucide-react"

type Status = {
  publicBaseUrl: string | null
  adfs: { enabled: boolean; displayName: string; issuer: string | null; discoveryUrl: string | null; clientId: string | null; clientSecretConfigured: boolean; caCertificateConfigured: boolean; redirectUri: string | null; scopes: string; usernameClaim: string; emailClaim: string; displayNameClaim: string }
  ldaps: { url: string | null; bindDn: string | null; bindPasswordConfigured: boolean; baseDn: string | null; userFilter: string; caCertificateConfigured: boolean; cioGroupDn: string | null }
  smtp: { host: string | null; port: number; secure: boolean; user: string | null; passwordConfigured: boolean; from: string | null; fromName: string | null }
}
type Draft = Record<string, string | number | boolean>
type Rule = { id: string; action: string; enabled: boolean }
type HttpsStatus = { certificateInstalled: boolean; privateKeyInstalled: boolean; chainInstalled: boolean; subject: string | null; expiresAt: string | null; fingerprint: string | null; runtimeConfigured: boolean; installed?: boolean }
const actions = ["topic.created", "topic.updated", "topic.finish_date_changed", "topic.allocations_replaced", "topic.assignee_changed", "topic.validation", "topic.collaborator_added", "topic.milestone_added", "topic.milestone_updated", "topic.milestone_deleted"]

export function SettingsPage() {
  const { data: session } = useGetSession()
  const canRestore = session?.capabilities?.includes("settings.recovery") ?? false
  const [status, setStatus] = React.useState<Status | null>(null)
  const [draft, setDraft] = React.useState<Draft>({})
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [tab, setTab] = React.useState<"connections" | "notifications" | "recovery">("connections")
  const [rules, setRules] = React.useState<Rule[]>([])
  const [testRecipient, setTestRecipient] = React.useState("")
  const [httpsStatus, setHttpsStatus] = React.useState<HttpsStatus | null>(null)
  const [certificatePem, setCertificatePem] = React.useState("")
  const [privateKeyPem, setPrivateKeyPem] = React.useState("")
  const [chainPem, setChainPem] = React.useState("")
  const [clearChain, setClearChain] = React.useState(false)
  const [savingHttps, setSavingHttps] = React.useState(false)
  const load = React.useCallback(async () => {
    const response = await fetch("/api/admin/settings", { credentials: "include" })
    if (!response.ok) { setMessage(response.status === 403 ? "Only the local administrator, CIO, Service Heads, or Deputies can manage Settings." : "Settings could not be loaded."); return }
    const next = await response.json() as Status
    setStatus(next)
    setDraft({
      publicBaseUrl: next.publicBaseUrl ?? "", adfsEnabled: next.adfs.enabled, adfsDisplayName: next.adfs.displayName, adfsIssuer: next.adfs.issuer ?? "", adfsDiscoveryUrl: next.adfs.discoveryUrl ?? "", adfsClientId: next.adfs.clientId ?? "", adfsRedirectUri: next.adfs.redirectUri ?? "", adfsScopes: next.adfs.scopes, adfsUsernameClaim: next.adfs.usernameClaim, adfsEmailClaim: next.adfs.emailClaim, adfsDisplayNameClaim: next.adfs.displayNameClaim,
      ldapsUrl: next.ldaps.url ?? "", ldapsBindDn: next.ldaps.bindDn ?? "", ldapsBaseDn: next.ldaps.baseDn ?? "", ldapsUserFilter: next.ldaps.userFilter ?? "", ldapsCioGroupDn: next.ldaps.cioGroupDn ?? "",
      smtpHost: next.smtp.host ?? "", smtpPort: next.smtp.port ?? 587, smtpSecure: next.smtp.secure, smtpUser: next.smtp.user ?? "", smtpFrom: next.smtp.from ?? "", smtpFromName: next.smtp.fromName ?? "",
    })
    const ruleResponse = await fetch("/api/admin/notification-rules", { credentials: "include" })
    if (ruleResponse.ok) setRules(await ruleResponse.json())
    const httpsResponse = await fetch("/api/admin/settings/https", { credentials: "include" })
    if (httpsResponse.ok) setHttpsStatus(await httpsResponse.json())
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
  const saveRule = async (rule: Rule) => {
    const csrf = await fetch("/api/auth/csrf", { credentials: "include" }).then((response) => response.json())
    const response = await fetch(`/api/admin/notification-rules/${rule.id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.csrfToken }, body: JSON.stringify(rule) })
    if (response.ok) { setMessage("Notification rule saved."); await load() }
    else setMessage((await response.json()).error ?? "Notification rule could not be saved.")
  }
  const deleteRule = async (ruleId: string) => {
    const csrf = await fetch("/api/auth/csrf", { credentials: "include" }).then((response) => response.json())
    const response = await fetch(`/api/admin/notification-rules/${ruleId}`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf.csrfToken } })
    if (response.ok) { setRules((current) => current.filter((rule) => rule.id !== ruleId)); setMessage("Notification rule deleted.") }
    else setMessage("Notification rule could not be deleted.")
  }
  const sendTest = async () => {
    setMessage("")
    const csrf = await fetch("/api/auth/csrf", { credentials: "include" }).then((response) => response.json())
    const response = await fetch("/api/admin/settings/test-email", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.csrfToken }, body: JSON.stringify({ recipient: testRecipient }) })
    const body = await response.json()
    setMessage(response.ok ? `Test email sent to ${testRecipient}.` : body.error ?? "Test email could not be sent.")
  }
  const saveHttps = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingHttps(true); setMessage("")
    try {
      const csrf = await fetch("/api/auth/csrf", { credentials: "include" }).then((response) => response.json())
      const response = await fetch("/api/admin/settings/https", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.csrfToken }, body: JSON.stringify({ certificatePem, privateKeyPem, chainPem, clearChain }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "HTTPS certificate could not be saved.")
      setHttpsStatus(result); setCertificatePem(""); setPrivateKeyPem(""); setChainPem(""); setClearChain(false)
      setMessage(result.installed
        ? "HTTPS certificate saved and applied. Nginx confirmed the reload."
        : result.runtimeConfigured
          ? "HTTPS certificate saved, but not applied to Nginx. Check the web server and shared certificate volume."
          : "HTTPS certificate saved, but not applied: this API has no shared certificate directory (TLS_CERT_DIR). Nginx will keep serving its previous certificate. Replit previews use Replit-managed HTTPS.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "HTTPS certificate could not be saved.") } finally { setSavingHttps(false) }
  }
  const exportBackup = async () => {
    setMessage("")
    const response = await fetch("/api/admin/backup", { credentials: "include" })
    if (!response.ok) { setMessage((await response.json()).error ?? "Backup could not be exported."); return }
    const blob = await response.blob()
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "queuecraft-backup.json"
    link.click()
    URL.revokeObjectURL(link.href)
    setMessage("Backup exported.")
  }
  const restoreBackup = async (file: File) => {
    if (!window.confirm("Restore this backup? Current operational data will be replaced transactionally and all users will be signed out.")) return
    setMessage("Validating and restoring backup…")
    try {
      const backup = JSON.parse(await file.text())
      const csrf = await fetch("/api/auth/csrf", { credentials: "include" }).then((response) => response.json())
      const response = await fetch("/api/admin/backup/restore", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.csrfToken }, body: JSON.stringify(backup) })
      if (!response.ok) throw new Error((await response.json()).error ?? "Backup could not be restored.")
      setMessage("Backup restored successfully. All existing sessions were revoked; sign in again to continue.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Backup could not be restored.") }
  }
  if (!status) return <div className="p-8 text-sm text-muted-foreground">{message || "Loading settings…"}</div>
  return <div className="flex-1 space-y-6 p-8">
    <div><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Platform administration</p><h1 className="text-3xl font-bold tracking-tight">Settings</h1><p className="mt-1 text-muted-foreground">Configure QueueCraft’s runtime integrations directly in the application.</p></div>
    <div className="flex border-b"><button type="button" onClick={() => setTab("connections")} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === "connections" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>Connections</button><button type="button" onClick={() => setTab("notifications")} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === "notifications" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>Notifications</button>{canRestore && <button type="button" onClick={() => setTab("recovery")} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === "recovery" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>Backup & restore</button>}</div>
    {tab === "connections" && <>
    <Card className="border-primary/30 bg-primary/5"><CardHeader className="flex-row items-start gap-3 space-y-0"><LockKeyhole className="mt-0.5 h-5 w-5 text-primary" /><div><CardTitle className="text-base">Encrypted credentials</CardTitle><CardDescription className="mt-1">Passwords, client secrets, and LDAPS CA certificates are encrypted before storage and are never returned to this page. Leave a secret field blank to retain its current value.</CardDescription></div></CardHeader></Card>
    <div className="grid gap-4 lg:grid-cols-2">
       <Section icon={ShieldCheck} title="AD FS / OpenID Connect"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.adfsEnabled)} onChange={(event) => set("adfsEnabled", event.target.checked)} />Enable AD FS single sign-on</label><Text label="Display name" value={draft.adfsDisplayName} onChange={(v) => set("adfsDisplayName", v)} /><Text label="Issuer URL" value={draft.adfsIssuer} onChange={(v) => set("adfsIssuer", v)} /><Text label="Discovery URL (optional)" value={draft.adfsDiscoveryUrl} onChange={(v) => set("adfsDiscoveryUrl", v)} /><Text label="Client ID" value={draft.adfsClientId} onChange={(v) => set("adfsClientId", v)} /><Secret label="Client secret" configured={status.adfs.clientSecretConfigured} onChange={(v) => set("adfsClientSecret", v)} /><Text label="Redirect URI" value={draft.adfsRedirectUri} onChange={(v) => set("adfsRedirectUri", v)} /><p className="text-xs text-muted-foreground">Must exactly match the HTTPS redirect URI registered in AD FS.</p><Text label="Scopes" value={draft.adfsScopes} onChange={(v) => set("adfsScopes", v)} /><div className="grid gap-3 sm:grid-cols-3"><Text label="Username claim" value={draft.adfsUsernameClaim} onChange={(v) => set("adfsUsernameClaim", v)} /><Text label="Email claim" value={draft.adfsEmailClaim} onChange={(v) => set("adfsEmailClaim", v)} /><Text label="Display name claim" value={draft.adfsDisplayNameClaim} onChange={(v) => set("adfsDisplayNameClaim", v)} /></div><Certificate configured={status.adfs.caCertificateConfigured} onChange={(v) => set("adfsCaCertificate", v)} /></Section>
       <Section icon={Network} title="LDAPS / Active Directory"><Text label="LDAPS URL" value={draft.ldapsUrl} onChange={(v) => set("ldapsUrl", v)} /><Text label="Bind DN" value={draft.ldapsBindDn} onChange={(v) => set("ldapsBindDn", v)} /><Secret label="Bind password" configured={status.ldaps.bindPasswordConfigured} onChange={(v) => set("ldapsBindPassword", v)} /><Text label="Base DN" value={draft.ldapsBaseDn} onChange={(v) => set("ldapsBaseDn", v)} /><Text label="User filter" value={draft.ldapsUserFilter} onChange={(v) => set("ldapsUserFilter", v)} /><Text label="CIO group DN" value={draft.ldapsCioGroupDn} onChange={(v) => set("ldapsCioGroupDn", v)} /><Certificate configured={status.ldaps.caCertificateConfigured} onChange={(v) => set("ldapsCaCertificate", v)} /><p className="text-xs text-muted-foreground">Use this connection to import allowed users and provide LDAPS sign-in for provisioned active members. CIO authority follows membership of the configured CIO group.</p></Section>
       <Section icon={Mail} title="SMTP"><Text label="Host" value={draft.smtpHost} onChange={(v) => set("smtpHost", v)} /><Text label="Port" type="number" value={draft.smtpPort} onChange={(v) => set("smtpPort", Number(v))} /><Text label="From address" value={draft.smtpFrom} onChange={(v) => set("smtpFrom", v)} /><Text label="Sender display name" value={draft.smtpFromName} onChange={(v) => set("smtpFromName", v)} /><Text label="Username" value={draft.smtpUser} onChange={(v) => set("smtpUser", v)} /><Secret label="Password" configured={status.smtp.passwordConfigured} onChange={(v) => set("smtpPassword", v)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.smtpSecure)} onChange={(event) => set("smtpSecure", event.target.checked)} />Use TLS from connection start</label><div className="border-t pt-3"><Text label="Test recipient" value={testRecipient} onChange={setTestRecipient} /><p className="mt-1 text-xs text-muted-foreground">Save SMTP changes before sending a test.</p><Button className="mt-2" type="button" variant="outline" disabled={!testRecipient} onClick={() => void sendTest()}>Send test email</Button></div></Section>
      <Section icon={Server} title="Application"><Text label="Public base URL" value={draft.publicBaseUrl} onChange={(v) => set("publicBaseUrl", v)} /><p className="text-sm text-muted-foreground">Session signing is protected by the deployment bootstrap secret and cannot be changed while users are signed in.</p></Section>
    </div>
    <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
    {httpsStatus && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><LockKeyhole className="h-5 w-5 text-primary" />Organization PKI / HTTPS</CardTitle><CardDescription>Upload the site certificate and matching private key used by the deployed Nginx web server. This is separate from the AD FS and LDAPS CA certificates above. The key is encrypted in the database, then written with restricted permissions to the shared certificate volume for Nginx.</CardDescription></CardHeader><CardContent className="space-y-4">
       {httpsStatus && <div className="rounded-sm border bg-muted/20 p-3 text-sm"><div className="font-medium">{httpsStatus.certificateInstalled && httpsStatus.privateKeyInstalled ? "Certificate saved" : "No certificate uploaded"}</div>{httpsStatus.subject && <div className="mt-1 break-all text-muted-foreground">{httpsStatus.subject}</div>}{httpsStatus.expiresAt && <div className="mt-1 text-muted-foreground">Expires {new Date(httpsStatus.expiresAt).toLocaleDateString("en-GB")}</div>}{httpsStatus.fingerprint && <div className="mt-1 break-all font-mono text-xs text-muted-foreground">SHA-256 {httpsStatus.fingerprint}</div>}{!httpsStatus.runtimeConfigured && <p className="mt-2 text-amber-700 dark:text-amber-400" role="alert">This API has no shared certificate directory (TLS_CERT_DIR). Saved certificates cannot reach Nginx until the deployment mounts the shared certificate volume. Replit previews use Replit-managed HTTPS.</p>}</div>}
      <form className="space-y-3" onSubmit={(event) => void saveHttps(event)}>
        <HttpsPemField label="Certificate PEM" value={certificatePem} onChange={setCertificatePem} accept=".pem,.crt,.cer" required={!httpsStatus?.certificateInstalled} />
        <HttpsPemField label="Private key PEM" value={privateKeyPem} onChange={setPrivateKeyPem} accept=".pem,.key" required={!httpsStatus?.privateKeyInstalled} />
        <HttpsPemField label="Certificate chain PEM (optional)" value={chainPem} onChange={setChainPem} accept=".pem,.crt,.cer" />
        {httpsStatus.chainInstalled && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={clearChain} onChange={(event) => setClearChain(event.target.checked)} />Remove the existing certificate chain</label>}
        <p className="text-xs text-muted-foreground">Leave a field empty to keep the installed value. A new certificate must match the new or existing private key. Use a certificate valid for the site’s hostname; an incorrect hostname could make the site inaccessible over HTTPS. The development preview is TLS-terminated by Replit, so its certificate will not change.</p>
        <Button type="submit" disabled={savingHttps}><Upload className="mr-2 h-4 w-4" />{savingHttps ? "Installing…" : "Save HTTPS certificate"}</Button>
      </form>
    </CardContent></Card>}
    </>}
    {tab === "notifications" && <Card><CardHeader><CardTitle>Topic email notifications</CardTitle><CardDescription>Enable email for topic changes. Recipients are selected from the changed topic: all members of its role, the role lead and deputy, and the corresponding department lead and deputy.</CardDescription></CardHeader><CardContent className="space-y-3">{rules.map((rule) => <div key={rule.id} className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto] md:items-center"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={rule.action} onChange={(event) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, action: event.target.value } : item))}>{actions.map((action) => <option key={action} value={action}>{action}</option>)}</select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.enabled} onChange={(event) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: event.target.checked } : item))} />Enabled</label><Button type="button" variant="outline" onClick={() => void saveRule(rule)}>Save</Button><Button type="button" variant="outline" onClick={() => void deleteRule(rule.id)}>Delete</Button></div>)}<Button type="button" variant="outline" disabled={rules.length >= actions.length} onClick={() => setRules((current) => [...current, { id: crypto.randomUUID(), action: actions.find((action) => !current.some((rule) => rule.action === action)) ?? actions[0], enabled: true }])}>Add notification rule</Button></CardContent></Card>}
    {tab === "recovery" && canRestore && <Card><CardHeader className="flex-row items-start gap-3 space-y-0"><DatabaseBackup className="mt-0.5 h-5 w-5 text-primary" /><div><CardTitle>Application backup</CardTitle><CardDescription>Export every QueueCraft application table or restore a validated QueueCraft JSON backup. Production database backups remain the primary disaster-recovery mechanism.</CardDescription></div></CardHeader><CardContent className="flex flex-wrap gap-3"><Button type="button" onClick={() => void exportBackup()}>Download backup</Button><Label className="inline-flex h-10 cursor-pointer items-center rounded-md border px-4 text-sm font-medium hover:bg-accent">Restore backup<Input className="sr-only" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreBackup(file); event.target.value = "" }} /></Label></CardContent></Card>}
    {message && <p className="text-sm text-muted-foreground">{message}</p>}
  </div>
}
function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) { return <Card><CardHeader className="flex-row items-center gap-3 space-y-0"><Icon className="h-5 w-5 text-primary" /><CardTitle className="text-lg">{title}</CardTitle></CardHeader><CardContent className="space-y-3">{children}</CardContent></Card> }
function Text({ label, value, onChange, type = "text" }: { label: string; value: string | number | boolean | undefined; onChange: (value: string) => void; type?: string }) { return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={typeof value === "boolean" ? "" : value ?? ""} onChange={(event) => onChange(event.target.value)} /></div> }
function Secret({ label, configured, onChange }: { label: string; configured: boolean; onChange: (value: string) => void }) { return <div className="space-y-1"><Label>{label} {configured && <span className="text-xs text-green-600">(configured)</span>}</Label><Input type="password" autoComplete="new-password" placeholder={configured ? "Leave blank to keep existing value" : "Enter value"} onChange={(event) => onChange(event.target.value)} /></div> }
function Certificate({ configured, onChange }: { configured: boolean; onChange: (value: string) => void }) { return <div className="space-y-1"><Label>CA certificate {configured && <span className="text-xs text-green-600">(configured)</span>}</Label><Input type="file" accept=".pem,.crt,.cer,application/x-pem-file,application/pkix-cert" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(onChange) }} /><p className="text-xs text-muted-foreground">Import a PEM, CRT, or CER certificate. Leave empty to keep the current certificate.</p></div> }
function HttpsPemField({ label, value, onChange, accept, required = false }: { label: string; value: string; onChange: (value: string) => void; accept: string; required?: boolean }) { return <div className="space-y-1"><Label>{label}</Label><textarea className="flex min-h-20 w-full rounded-sm border bg-background p-2 font-mono text-xs" value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={required ? "-----BEGIN CERTIFICATE-----" : "Leave blank to keep current value"} spellCheck={false} /><Input type="file" accept={accept} aria-label={`Upload ${label}`} onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(onChange); event.target.value = "" }} /></div> }