import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * apify-mcp-client.ts — MCP SDK Integration using Apify Streamable HTTP endpoint
 * ──────────────────────────────────────────────────────────────────────────
 */
export class ApifyMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private isConnected = false;

  constructor(private token: string) {
    if (!token) {
      throw new Error("APIFY_TOKEN is required for ApifyMcpClient");
    }
  }

  async connect(): Promise<void> {
    // Apify hosted server moved from /sse to Streamable HTTP
    const url = new URL("https://mcp.apify.com");
    
    this.transport = new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    });

    this.client = new Client(
      { name: "openclaw-ads-bot", version: "2.6.0" },
      { capabilities: {} }
    );

    console.log(`[MCP 🌐] Connecting to Apify MCP Server (Streamable HTTP): ${url.toString()}...`);
    
    // Add a connection timeout
    const connectPromise = this.client.connect(this.transport);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout connecting to MCP Server (5s)")), 5000));
    
    await Promise.race([connectPromise, timeoutPromise]);
    
    this.isConnected = true;
    console.log("[MCP 🌐] Connected successfully via Streamable HTTP.");
  }

  async ensureConnected(): Promise<void> {
    if (!this.isConnected || !this.client) {
      console.log("[MCP 🌐] Re-establishing lost connection...");
      await this.connect();
    }
  }

  async listTools() {
    await this.ensureConnected();
    if (!this.client) throw new Error("MCP Client not connected");
    return await this.client.listTools();
  }

  async callTool(name: string, args: any) {
    await this.ensureConnected();
    if (!this.client) throw new Error("MCP Client not connected");
    
    console.log(`[MCP 🚀] Calling tool: ${name}`);
    
    try {
      const result = await this.client.callTool({
        name,
        arguments: args,
      });
      return result;
    } catch (error: any) {
      console.error(`[MCP ❌] Tool call failed: ${name}`, error.message);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (e) {
        // Ignore close errors
      }
      this.client = null;
      this.transport = null;
      this.isConnected = false;
    }
  }
}

let mcpInstance: ApifyMcpClient | null = null;

export async function getApifyMcpClient(): Promise<ApifyMcpClient> {
  if (mcpInstance) return mcpInstance;
  
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error("Missing APIFY_TOKEN in environment");
  }

  mcpInstance = new ApifyMcpClient(token);
  await mcpInstance.connect();
  return mcpInstance;
}
