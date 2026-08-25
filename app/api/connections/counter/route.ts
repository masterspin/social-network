import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: { message: "Connection amendments are no longer supported." } },
    { status: 410 },
  );
}
