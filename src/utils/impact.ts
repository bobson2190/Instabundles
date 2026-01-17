import fetch from "node-fetch";

export async function generateImpactLink(bundleLink: string, bundleMachineName: string): Promise<string | null> {
  try {
    if (!process.env.IMPACT_ACCOUNT_SID || !process.env.IMPACT_AUTH_TOKEN || !process.env.IMPACT_PROGRAM_ID) {
      console.error("[Impact] Missing environment variables");
      return null;
    }

    const editedMachineName = bundleMachineName.replace("_bundle", "");
    const customPath = "dsc_" + editedMachineName;
    const url = `https://api.impact.com/Mediapartners/${process.env.IMPACT_ACCOUNT_SID}/Programs/${process.env.IMPACT_PROGRAM_ID}/TrackingLinks?CustomPath=${encodeURIComponent(customPath)}&DeepLink=${encodeURIComponent(bundleLink)}&Type=vanity&SubId1=Instabundles`;
    const auth = Buffer.from(`${process.env.IMPACT_ACCOUNT_SID}:${process.env.IMPACT_AUTH_TOKEN}`).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": `Basic ${auth}`,
      },
    });

    if (!res.ok) {
      console.error(`[Impact] Request failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();

    return data.TrackingURL ? "https://" + data.TrackingURL : null;

  } catch (error) {
    console.error(`[Impact] Error generating tracking link for ${bundleLink}:`, error);
    return null;
  }
}