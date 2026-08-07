import { NextResponse } from "next/server";
import { beachNoirLibrary } from "@/lib/library";

export async function GET() {
  return NextResponse.json(beachNoirLibrary, {
    headers: {
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
