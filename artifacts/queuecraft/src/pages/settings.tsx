import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LockKeyhole, Mail, Network, ShieldCheck, Server } from "lucide-react"

const services = [
  { title: "AD FS / OpenID Connect", icon: ShieldCheck, detail: "Single sign-on issuer, client ID, redirect URI, and client secret.", keys: "ADFS_ISSUER_URL, ADFS_CLIENT_ID, ADFS_REDIRECT_URI, ADFS_CLIENT_SECRET" },
  { title: "LDAPS / Active Directory", icon: Network, detail: "Directory server, service account, search base, filters, CIO group, and trusted certificate chain.", keys: "LDAPS_URL, LDAPS_BIND_DN, LDAPS_BIND_PASSWORD, LDAPS_BASE_DN, LDAPS_CIO_GROUP_DN" },
  { title: "SMTP", icon: Mail, detail: "Outbound notification host, port, sender address, credentials, and TLS mode.", keys: "SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE" },
  { title: "Sessions & database", icon: Server, detail: "Application session signing and PostgreSQL connectivity.", keys: "SESSION_SECRET, DATABASE_URL, PUBLIC_BASE_URL" },
]

export function SettingsPage() {
  return (
    <div className="flex-1 space-y-6 p-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Platform administration</p>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Configure QueueCraft’s operational integrations and deployment environment.</p>
      </div>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex-row items-start gap-3 space-y-0">
          <LockKeyhole className="mt-0.5 h-5 w-5 text-primary" />
          <div><CardTitle className="text-base">Secure configuration</CardTitle><CardDescription className="mt-1">Secrets, LDAP certificates, private keys, and passwords are never stored or displayed in QueueCraft. Configure them through the deployment’s encrypted Secrets area, then restart the service to apply changes.</CardDescription></div>
        </CardHeader>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {services.map((service) => (
          <Card key={service.title}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="flex items-center gap-3"><service.icon className="h-5 w-5 text-primary" /><CardTitle className="text-lg">{service.title}</CardTitle></div>
              <Badge variant="secondary">Deployment managed</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{service.detail}</p>
              <div><div className="mb-1 text-xs font-mono uppercase text-muted-foreground">Configuration keys</div><code className="block break-words rounded-sm border bg-muted/30 p-2 text-xs">{service.keys}</code></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">After adding or rotating a certificate or secret, restart the API service. The configuration is intentionally kept outside the database and browser to protect service credentials.</p>
    </div>
  )
}