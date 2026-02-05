import {
  BedrockAgentClient,
  CreateKnowledgeBaseCommand,
  CreateDataSourceCommand,
  AssociateAgentKnowledgeBaseCommand,
  StartIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent"
import { 
  S3Client, 
  CreateBucketCommand
} from "@aws-sdk/client-s3"
import { S3VectorsClient, CreateVectorBucketCommand, CreateIndexCommand } from "@aws-sdk/client-s3vectors"
import { v4 as uuidv4 } from "uuid"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, dimensions = 1024 } = body // Default to Titan V2 dimensions

    const region = process.env.AWS_REGION || "us-east-1"
    const accountId = process.env.NEXT_AWS_ACCOUNT_ID || "336636636636"
    const agentId = process.env.BEDROCK_RETRIEVE_AGENT_ID || "QSSCWG19UJ"
    const roleArn = process.env.BEDROCK_KB_ROLE_ARN || "arn:aws:iam::336636636636:role/bedrock-agent-role"
    const embeddingModelArn =
      process.env.BEDROCK_EMBED_MODEL_ARN ||
      `arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0`

    console.log(`🌍 Creating resources in region: ${region}`)

    // Initialize clients - ALL must use the same region
    const s3Vectors = new S3VectorsClient({ region })
    const s3 = new S3Client({ region })
    const bedrock = new BedrockAgentClient({ region })

    // Step 1: Create S3 Vector Bucket (not a regular S3 bucket!)
    const vectorBucketName = `kb-vectors-${uuidv4().substring(0, 12)}`
    
    console.log(`📦 Creating S3 Vector Bucket: ${vectorBucketName}`)
    await s3Vectors.send(
      new CreateVectorBucketCommand({
        vectorBucketName: vectorBucketName,
      })
    )
    console.log(`✅ S3 Vector Bucket created`)

    // Wait for vector bucket propagation
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Step 2: Create Vector Index inside the vector bucket
    const vectorIndexName = "bedrock-kb-index"
    
    console.log(`🔍 Creating Vector Index: ${vectorIndexName}`)
    await s3Vectors.send(
      new CreateIndexCommand({
        vectorBucketName: vectorBucketName,
        indexName: vectorIndexName,
        dataType: "float32",
        dimension: dimensions, // Must match embedding model dimensions
        distanceMetric: "cosine", // or "EUCLIDEAN"
      })
    )
    console.log(`✅ Vector Index created`)

    // Wait for index propagation
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Step 3: Create regular S3 bucket for document storage
    const documentBucketName = `kb-docs-${uuidv4().substring(0, 12)}`
    
    const createBucketParams: any = {
      Bucket: documentBucketName,
    }
    
    if (region !== "us-east-1") {
      createBucketParams.CreateBucketConfiguration = {
        LocationConstraint: region,
      }
    }
    
    await s3.send(new CreateBucketCommand(createBucketParams))
    console.log(`✅ Document S3 bucket created: ${documentBucketName}`)

    // Wait for S3 propagation
    await new Promise((resolve) => setTimeout(resolve, 5000))

    const kbName = name || `S3VectorKB-${vectorBucketName.slice(-8)}`

    console.log(`📋 Knowledge Base Configuration:`)
    console.log(`   Region: ${region}`)
    console.log(`   Vector Bucket: ${vectorBucketName}`)
    console.log(`   Vector Index: ${vectorIndexName}`)
    console.log(`   Document Bucket: ${documentBucketName}`)
    console.log(`   Embedding Model: ${embeddingModelArn}`)

    // Step 4: Create Knowledge Base with S3 Vectors
    const vectorIndexArn = `arn:aws:s3vectors:${region}:${accountId}:bucket/${vectorBucketName}/index/${vectorIndexName}`
    
    const createKbInput = {
      name: kbName,
      description: "Knowledge base using S3 Vectors for shuttle trip and fare data",
      roleArn,
      knowledgeBaseConfiguration: {
        type: "VECTOR" as const,
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn,
        },
      },
      storageConfiguration: {
        type: "S3_VECTORS" as const,
        s3VectorsConfiguration: {
          indexArn: vectorIndexArn, // Use index ARN, not bucket ARN!
        },
      },
      tags: {
        project: "metropolitan-shuttle",
        storage: "s3-vectors-preview",
        region: region,
        created: new Date().toISOString(),
      },
    }

    console.log("Creating knowledge base with S3 Vectors storage...")
    const kbResponse = await bedrock.send(new CreateKnowledgeBaseCommand(createKbInput))
    const knowledgeBaseId = kbResponse.knowledgeBase?.knowledgeBaseId

    if (!knowledgeBaseId) {
      throw new Error("Knowledge base creation failed - no ID returned")
    }

    console.log(`✅ Knowledge base created: ${knowledgeBaseId}`)

    // Wait for KB to be ready
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Step 5: Create Data Source for document ingestion
    const dataSourceInput = {
      knowledgeBaseId,
      name: `${kbName}-datasource`,
      description: "S3 data source for shuttle documentation",
      dataSourceConfiguration: {
        type: "S3" as const,
        s3Configuration: {
          bucketArn: `arn:aws:s3:::${documentBucketName}`,
          inclusionPrefixes: ["documents/"],
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: "FIXED_SIZE" as const,
          fixedSizeChunkingConfiguration: {
            maxTokens: 512,
            overlapPercentage: 20,
          },
        },
      },
    }

    const dataSourceResponse = await bedrock.send(
      new CreateDataSourceCommand(dataSourceInput)
    )
    const dataSourceId = dataSourceResponse.dataSource?.dataSourceId

    console.log(`✅ Data source created: ${dataSourceId}`)

    // Step 6: Link Knowledge Base to Agent
    await bedrock.send(
      new AssociateAgentKnowledgeBaseCommand({
        agentId,
        agentVersion: "DRAFT",
        knowledgeBaseId,
        description: "Metropolitan Shuttle data retrieval using S3 Vectors",
        knowledgeBaseState: "ENABLED" as const,
      })
    )

    console.log(`✅ Knowledge base linked to agent: ${agentId}`)

    return NextResponse.json({
      success: true,
      message: "Knowledge base with S3 Vectors storage created and linked successfully.",
      kb: {
        id: knowledgeBaseId,
        name: kbName,
        vectorBucket: vectorBucketName,
        vectorIndex: vectorIndexName,
        vectorIndexArn,
        documentBucket: documentBucketName,
        dataSourceId,
        linkedAgent: agentId,
        storageType: "S3_VECTORS",
        region,
        dimensions,
        status: "active",
      },
      nextSteps: [
        `1. Upload documents: aws s3 cp ./your-docs s3://${documentBucketName}/documents/ --recursive`,
        `2. Trigger ingestion: POST to this endpoint with { "knowledgeBaseId": "${knowledgeBaseId}", "dataSourceId": "${dataSourceId}" }`,
        `3. Query your knowledge base through the Bedrock agent`,
      ],
      uploadCommand: `aws s3 cp ./documents s3://${documentBucketName}/documents/ --recursive`,
    })
  } catch (err: any) {
    console.error("❌ Error creating KB:", err)
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        details: err.stack,
        hint: "Ensure S3 Vectors is available in your region and IAM role has s3vectors:* permissions",
      },
      { status: 500 }
    )
  }
}

// PUT endpoint to trigger ingestion after documents are uploaded
export async function PUT(req: Request) {
  try {
    const { knowledgeBaseId, dataSourceId } = await req.json()
    
    if (!knowledgeBaseId || !dataSourceId) {
      return NextResponse.json(
        { success: false, error: "knowledgeBaseId and dataSourceId are required" },
        { status: 400 }
      )
    }

    const region = process.env.AWS_REGION || "us-east-1"
    const bedrock = new BedrockAgentClient({ region })
    
    console.log(`Starting ingestion for KB: ${knowledgeBaseId}`)
    
    const ingestionResponse = await bedrock.send(
      new StartIngestionJobCommand({
        knowledgeBaseId,
        dataSourceId,
        description: `Syncing documents to S3 Vectors at ${new Date().toISOString()}`,
      })
    )

    return NextResponse.json({
      success: true,
      ingestionJob: {
        id: ingestionResponse.ingestionJob?.ingestionJobId,
        status: ingestionResponse.ingestionJob?.status,
        startedAt: ingestionResponse.ingestionJob?.startedAt,
      },
      message: "Ingestion job started. Documents are being processed and vectorized into S3.",
    })
  } catch (err: any) {
    console.error("❌ Error starting ingestion:", err)
    return NextResponse.json(
      { 
        success: false, 
        error: err.message,
        details: err.stack,
      }, 
      { status: 500 }
    )
  }
}