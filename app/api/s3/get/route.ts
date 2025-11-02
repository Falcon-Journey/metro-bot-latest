import { NextResponse } from "next/server"
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3"

const s3 = new S3Client({ region: process.env.AWS_REGION })

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
  const prefix = searchParams.get("prefix") || ""

  try {
    const bucketName = getBucketForType(type)
    if (!bucketName) {
      return NextResponse.json({ error: "Invalid bucket type" }, { status: 400 })
    }

    // List all objects with the given prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      Delimiter: "/", // This returns folders as CommonPrefixes
    })

    const listResponse = await s3.send(listCommand)

    // Extract folder names from CommonPrefixes
    const folders = (listResponse.CommonPrefixes || [])
      .map((p) => p.Prefix?.replace(prefix, "").replace(/\/$/, ""))
      .filter(Boolean) as string[]

    // Extract file names from Contents
    const files = (listResponse.Contents || [])
      .filter((obj) => obj.Key && obj.Key !== prefix) // Exclude the prefix itself
      .map((obj) => obj.Key!.replace(prefix, ""))
      .filter(Boolean) as string[]

    return NextResponse.json({ folders, files, prefix })
  } catch (error) {
    console.error("S3 list error:", error)
    return NextResponse.json({ error: "Failed to list S3 objects" }, { status: 500 })
  }
}

function getBucketForType(type: string | null): string | null {
  const bucketMap: Record<string, string> = {
    voice: process.env.AWS_VOICE_BUCKET || "",
    chat: process.env.AWS_CHAT_BUCKET || "",
    cms: process.env.AWS_CMS_BUCKET || "",
  }
  return bucketMap[type || ""] || null
}
