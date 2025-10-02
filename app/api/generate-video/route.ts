import { NextResponse } from "next/server";

export async function POST() {
    return NextResponse.json(
        { message: "Video generation API is not implemented yet." },
        { status: 501 }
    );
}
