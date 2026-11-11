import { notFound } from "next/navigation";
import Home from "@/app/page";
import { viewFromPath } from "@/lib/view-routes";

export default async function ViewRoute({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const resolved = viewFromPath(`/${view}`);
  if (!resolved || resolved === "dashboard") notFound();
  return <Home initialView={resolved} />;
}
