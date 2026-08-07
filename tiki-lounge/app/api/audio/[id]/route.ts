import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function cleanGatewayUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gatewayUrl = process.env.LIBRARY_GATEWAY_URL;
  const gatewaySecret = process.env.LIBRARY_GATEWAY_SECRET;

  if (!gatewayUrl || !gatewaySecret) {
    return NextResponse.json({ error: "Drive library is not configured" }, { status: 404 });
  }

  const { id } = await context.params;

  try {
    const response = await fetch(
      `${cleanGatewayUrl(gatewayUrl)}/v1/sign/${encodeURIComponent(id)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${gatewaySecret}` },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Track is unavailable" }, { status: response.status });
    }

    const payload = (await response.json()) as { url?: string };

    if (!payload.url) {
      return NextResponse.json({ error: "Gateway did not return a stream URL" }, { status: 502 });
    }

    return NextResponse.redirect(payload.url, 307);
  } catch (error) {
    console.error("Unable to sign audio URL", error);
    return NextResponse.json({ error: "Unable to prepare this track" }, { status: 502 });
  }
}
