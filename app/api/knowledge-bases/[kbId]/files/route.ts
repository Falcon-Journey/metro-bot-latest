import { NextResponse } from "next/server"
import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3"
import { v4 as uuidv4 } from "uuid"

export const dynamic = "force-dynamic"

const region = process.env.AWS_REGION || "us-west-2"
const s3 = new S3Client({ region })

// 🧠 Helper: get S3 info for KB from environment
async function getKnowledgeBaseS3Info(kbId: string) {
  console.log("🔍 Fetching S3 info from environment for:", kbId)

  const envKey = `${kbId}_BUCKET`
  let s3Uri = process.env[envKey]

  if (!s3Uri) {
    throw new Error(`Missing environment variable: ${envKey}. Expected format: s3://bucket-name/prefix/`)
  }
    if (!s3Uri.startsWith("s3://")) {
    s3Uri = `s3://${s3Uri}`
  }

  // Parse the URI: "s3://bucket-name/prefix/path/"
  const match = s3Uri.match(/^s3:\/\/([^/]+)\/?(.*)$/)
  if (!match) {
    throw new Error(`Invalid S3 URI format in ${envKey}: ${s3Uri}`)
  }

  const bucket = match[1]
  const prefix = match[2] ? match[2].replace(/\/+$/, "") + "/" : ""

  console.log("✅ Parsed KB S3 config from env:", { bucket, prefix })
  return { bucket, prefix }
}

/**
 * GET → List files in S3 bucket linked to the KB
 */
export async function GET(req: Request, context: { params: Promise<{ kbId: string }> }) {
  console.log("📥 [GET] /api/knowledge-bases/[kbId]/files called")

  try {
    const { kbId } = await context.params
    console.log("➡️  Received kbId:", kbId)

    const { bucket, prefix } = await getKnowledgeBaseS3Info(kbId)
    console.log(`📂 Listing files from S3 → bucket: ${bucket}, prefix: ${prefix}`)

    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      })
    )

    const files =
      res.Contents?.map((obj) => ({
        id: obj.Key!,
        name: obj.Key?.split("/").pop() || obj.Key,
        size: `${(obj.Size! / 1024).toFixed(1)} KB`,
        lastModified: obj.LastModified ? new Date(obj.LastModified).toLocaleString() : "N/A",
      })) || []

    console.log("✅ Files listed:", files)

    return NextResponse.json(files)
  } catch (err: any) {
    console.error("❌ [GET] Error listing S3 files:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST → Upload a file to S3 bucket linked to the KB
 */
export async function POST(req: Request, context: { params: Promise<{ kbId: string }> }) {
  console.log("📤 [POST] /api/knowledge-bases/[kbId]/files called")

  try {
    const { kbId } = await context.params
    console.log("➡️  Received kbId:", kbId)

    const { bucket, prefix } = await getKnowledgeBaseS3Info(kbId)
    console.log(`📦 Upload target → bucket: ${bucket}, prefix: ${prefix}`)

    const formData = await req.formData()
    const file = formData.get("file") as File

    if (!file) {
      console.warn("⚠️ No file found in request")
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    console.log(`📎 Uploading file: ${file.name} (${file.size} bytes)`)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const key = `${prefix}${uuidv4()}-${file.name}`

    console.log("🆔 Generated S3 key:", key)

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      })
    )

    console.log("✅ File successfully uploaded to S3:", key)

    return NextResponse.json({ success: true, filename: file.name, key })
  } catch (err: any) {
    console.error("❌ [POST] Upload error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
