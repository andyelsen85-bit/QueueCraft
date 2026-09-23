import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginPage() {
  const [local, setLocal] = React.useState(false)
  const [bootstrap, setBootstrap] = React.useState(false)
  const [username, setUsername] = React.useState("admin")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    Promise.all([fetch("/api/auth/providers").then((r) => r.json()), fetch("/api/auth/bootstrap").then((r) => r.json())]).then(([providers, first]) => { setLocal(Boolean(first.required)); setBootstrap(Boolean(first.required)); if (providers.adfs) setLocal(false) }).catch(() => setError("Unable to contact QueueCraft."))
  }, [])
  const submit = async () => {
    setError("")
    const endpoint = bootstrap ? "/api/auth/bootstrap" : "/api/auth/local"
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bootstrap ? { password } : { username, password }) })
    if (!response.ok) { setError((await response.json()).error ?? "Authentication failed"); return }
    if (bootstrap) { setBootstrap(false); setError("Administrator created. Sign in with the password you chose."); return }
    window.location.href = "/"
  }
  const sso = () => { window.location.href = `/api/auth/login?returnTo=${encodeURIComponent("/")}` }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div><h1 className="text-2xl font-bold">QueueCraft</h1><p className="text-sm text-muted-foreground">{bootstrap ? "Create the first administrator password" : "Sign in to continue"}</p></div>
        {!bootstrap && <div className="space-y-3"><Label>Username</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} /></div>}
        <div className="space-y-3"><Label>{bootstrap ? "Administrator password" : "Password"}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" onClick={() => void submit()}>{bootstrap ? "Create administrator" : "Sign in"}</Button>
        {!bootstrap && !local && <Button variant="outline" className="w-full" onClick={sso}>Sign in with AD FS</Button>}
      </div>
    </div>
  )
}