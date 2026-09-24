import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginPage() {
  const [adfs, setAdfs] = React.useState(false)
  const [adfsDisplayName, setAdfsDisplayName] = React.useState("Sign in with AD FS")
  const [ldaps, setLdaps] = React.useState(false)
  const [method, setMethod] = React.useState<"local" | "ldaps">("local")
  const [bootstrap, setBootstrap] = React.useState(false)
   const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    const adfsError = new URLSearchParams(window.location.search).get("adfsError")
    if (adfsError) setError(`AD FS sign-in failed (${adfsError}). Check the AD FS settings and server logs.`)
    Promise.all([fetch("/api/auth/providers").then((r) => r.json()), fetch("/api/auth/bootstrap").then((r) => r.json())]).then(([providers, first]) => {
      setAdfs(Boolean(providers.adfs))
      if (typeof providers.adfsDisplayName === "string" && providers.adfsDisplayName) setAdfsDisplayName(providers.adfsDisplayName)
      setLdaps(Boolean(providers.ldaps))
      setBootstrap(Boolean(first.required))
      if (providers.ldaps && !first.required) setMethod("ldaps")
    }).catch(() => setError("Unable to contact QueueCraft."))
  }, [])
  const submit = async () => {
    setError("")
    const endpoint = bootstrap ? "/api/auth/bootstrap" : method === "ldaps" ? "/api/auth/ldap" : "/api/auth/local"
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
         {!bootstrap && ldaps && <div className="grid grid-cols-2 gap-2"><Button type="button" variant={method === "ldaps" ? "default" : "outline"} onClick={() => setMethod("ldaps")}>LDAPS account</Button><Button type="button" variant={method === "local" ? "default" : "outline"} onClick={() => setMethod("local")}>Local account</Button></div>}
         {!bootstrap && <div className="space-y-3"><Label>{method === "ldaps" ? "Directory username" : "Email or admin username"}</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} /></div>}
        <div className="space-y-3"><Label>{bootstrap ? "Administrator password" : "Password"}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p className="text-sm text-destructive">{error}</p>}
         <Button className="w-full" onClick={() => void submit()}>{bootstrap ? "Create administrator" : method === "ldaps" ? "Sign in with LDAPS" : "Sign in with local account"}</Button>
        {!bootstrap && adfs && <Button variant="outline" className="w-full" onClick={sso}>{adfsDisplayName}</Button>}
      </div>
    </div>
  )
}