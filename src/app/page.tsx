import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { tools } from "@/lib/tools";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 space-y-12">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Every PDF tool you need, right in your browser
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Free, private, and works offline. Your files never leave your device.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map((tool) => (
          <Link key={tool.href} href={tool.href}>
            <Card className="h-full transition-all hover:shadow-lg hover:-translate-y-0.5">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <tool.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">{tool.title}</CardTitle>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
