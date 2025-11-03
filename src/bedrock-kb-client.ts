import * as clientBedrockAgentRuntime from "@aws-sdk/client-bedrock-agent-runtime";
import { fromEnv } from "@aws-sdk/credential-providers";


// Define interfaces for type safety
interface RetrieveOptions {
    knowledgeBaseId: string;
    query: string;
    numberOfResults?: number;
    retrievalFilter?: Record<string, any>;
}

interface RetrievalResult {
    content: string;
    metadata: {
        source: string;
        location?: string;
        title?: string;
        excerpt?: string;
    };
    score: number;
}
class BedrockKnowledgeBaseClient {
    private client: clientBedrockAgentRuntime.BedrockAgentRuntimeClient;
    constructor(region: string = 'us-east-1') {
        this.client = new clientBedrockAgentRuntime.BedrockAgentRuntimeClient({
            region,
            credentials: fromEnv() // This will use environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, etc.
        }); 
    }


    // Retrieves information from the Bedrock Knowledge Base
    async retrieveFromKnowledgeBase(options: RetrieveOptions): Promise<Object> {
        const { knowledgeBaseId, query, numberOfResults = 5, retrievalFilter } = options;

        try {
            // Build the command input
            const input: clientBedrockAgentRuntime.RetrieveCommandInput = {
                knowledgeBaseId,
                retrievalQuery: {
                    text: query
                },
                retrievalConfiguration: {
                    vectorSearchConfiguration: {
                        numberOfResults
                    }
                }
            };

            // Attach metadata filter under vectorSearchConfiguration.filter if provided
            if (retrievalFilter) {
                (input.retrievalConfiguration as any).vectorSearchConfiguration.filter = retrievalFilter;
            }

            // Execute the retrieval command
            const command = new clientBedrockAgentRuntime.RetrieveCommand(input);

            const response: clientBedrockAgentRuntime.RetrieveCommandOutput = await this.client.send(command);

            // Process and format the results
            if (!response.retrievalResults || response.retrievalResults.length === 0) {
                return [];
            }

            // Safely map the results with correct type handling
            const results: RetrievalResult[] = [];

            for (const result of response.retrievalResults) {
                // Extract content - ensure it's a string
                const content = result.content?.text || "";

                // Extract source with proper null checking
                let source = "Unknown source";
                let location: string | undefined = undefined;

                if (result.location?.s3Location) {
                    source = result.location.s3Location.uri?.split('/').pop() || "Unknown S3 file";
                    location = result.location.s3Location.uri;
                } else if (result.location?.confluenceLocation) {
                    source = result.location.confluenceLocation.url || "Unknown Confluence page";
                    location = result.location.confluenceLocation.url;
                } else if (result.location?.webLocation) {
                    source = "Web source";
                    // Access URL property safely
                    const webLocation: any = result.location.webLocation;
                    if (webLocation && (webLocation.url || webLocation.uri)) {
                        location = webLocation.url || webLocation.uri;
                    }
                }
                // Safely extract metadata
                const title = result.metadata?.title;
                const excerpt = result.metadata?.excerpt;

                const metadata = {
                    source,
                    location,
                    title: typeof title === 'string' ? title : "",
                    excerpt: typeof excerpt === 'string' ? excerpt : ""
                };


                // Get relevance score
                const score = result.score || 0;

                results.push({
                    content,
                    metadata,
                    score
                });
            }
            return results;
        } catch (error) {
            console.error("Error retrieving from Bedrock Knowledge Base:", error);
            throw error;
        }
    }
}

export { BedrockKnowledgeBaseClient };
export type { RetrieveOptions, RetrievalResult };
