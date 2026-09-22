import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full px-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-6">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
      </div>
      <h1 className="text-4xl font-bold tracking-tight mb-2">System Error 404</h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-md">
        The requested operational route could not be found or does not exist.
      </p>
      <Link href="/">
        <Button size="lg" className="font-mono">
          RETURN TO DASHBOARD
        </Button>
      </Link>
    </div>
  );
}
