/**
 * apify-api.ts — Direct interaction with Apify REST API v2
 * ────────────────────────────────────────────────────────
 * Used for administrative tasks like balance monitoring.
 */

export interface ApifyAccountInfo {
  id: string;
  username: string;
  email: string;
  plan?: {
    type: string;
    status: string;
  };
  subscription?: {
    currentPeriodEnd: string;
  };
}

export interface ApifyUsageMetrics {
  serviceUsage: {
    [key: string]: {
      quantity: number;
      baseAmountUsd: number;
    }
  };
  totalUsageCreditsUsdBeforeVolumeDiscount: number;
}

export class ApifyApiService {
  private baseUrl = "https://api.apify.com/v2";

  constructor(private token: string) {
    if (!token) throw new Error("APIFY_TOKEN is required for ApifyApiService");
  }

  async getMe() {
    const response = await fetch(`${this.baseUrl}/users/me`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch account info: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  async getMonthlyUsage() {
    const response = await fetch(`${this.baseUrl}/users/me/usage/monthly`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch usage info: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }
}

export async function getApifyAccountSummary() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Missing APIFY_TOKEN");

  const service = new ApifyApiService(token);
  const me = await service.getMe();
  const usage = await service.getMonthlyUsage();

  return { me, usage };
}
