import { NextResponse } from "next/server";
import { health } from "@/lib/uni/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const h = await health();
  return NextResponse.json(h);
}
