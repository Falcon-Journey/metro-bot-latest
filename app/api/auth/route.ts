import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { password } = await req.json()
  const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD

  if (!adminPassword) {
    return NextResponse.json({ error: "Server misconfiguration: missing ADMIN_PASSWORD" }, { status: 500 })
  }

  if (password === adminPassword) {
    return NextResponse.json({ success: true })
  } else {
    return NextResponse.json({ success: false, error: "Incorrect password" }, { status: 401 })
  }
}
