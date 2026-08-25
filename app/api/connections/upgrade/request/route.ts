import { NextResponse } from "next/server";

const gone = {
  error: { message: "Connection type upgrade requests are no longer supported." },
};

export async function POST() {
  return NextResponse.json(gone, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json(gone, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json(gone, { status: 410 });
}
