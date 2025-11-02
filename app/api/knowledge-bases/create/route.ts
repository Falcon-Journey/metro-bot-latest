import { NextResponse } from "next/server"
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3"
import { v4 as uuidv4 } from "uuid"

// If you’re using a database, import your DB client here (e.g., Prisma or Supabase)
// import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { type } = body

    if (type !== "S3") {
      return NextResponse.json({ success: false, error: "Only S3 type supported currently." }, { status: 400 })
    }

    // ✅ Step 1: Initialize AWS S3 client
    const s3 = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })

    // ✅ Step 2: Generate unique bucket name
    const kbId = uuidv4()
    const bucketName = `kb-${kbId}`

    // ✅ Step 3: Create the bucket
    await s3.send(
      new CreateBucketCommand({
        Bucket: bucketName,
      })
    )

    // ✅ Step 4: Optionally store KB info in your DB
    // const newKB = await prisma.knowledgeBase.create({
    //   data: {
    //     id: kbId,
    //     name: `Knowledge Base ${kbId.slice(0, 6)}`,
    //     type: "S3",
    //     s3Bucket: bucketName,
    //     status: "active",
    //     lastSync: new Date().toISOString(),
    //   },
    // })

    // ✅ Step 5: Return success
    return NextResponse.json({
      success: true,
      message: "Knowledge Base created and linked to S3 successfully.",
      kb: {
        id: kbId,
        name: `Knowledge Base ${kbId.slice(0, 6)}`,
        type: "S3",
        s3Bucket: bucketName,
        status: "active",
        lastSync: new Date().toISOString(),
      },
    })
  } catch (err: any) {
    console.error("❌ Error creating knowledge base:", err)
    return NextResponse.json(
      { success: false, error: err.message || "Unknown error creating KB" },
      { status: 500 }
    )
  }
}
