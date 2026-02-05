import { type NextRequest, NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
  },
})

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const type = formData.get("type") as string

    if (!file || !type) {
      return NextResponse.json({ error: "Missing file or type" }, { status: 400 })
    }

    // Determine bucket based on type
    let bucketName: string | undefined
    if (type === "voice") {
      bucketName = process.env.AWS_VOICE_BUCKET
    } else if (type === "chat") {
      bucketName = process.env.AWS_CHAT_BUCKET
    } else if (type === "cms") {
      bucketName = process.env.AWS_CMS_BUCKET
    }

    if (!bucketName) {
      return NextResponse.json({ error: "Invalid type or bucket not configured" }, { status: 400 })
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: file.name,
      Body: buffer,
      ContentType: file.type,
    })

    await s3Client.send(command)

    return NextResponse.json({ success: true, fileName: file.name })
  } catch (error) {
    console.error("Error uploading to S3:", error)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
