import fetch from "node-fetch";

export async function generateImpactLink(bundleStore: string, bundleLink: string, bundleMachineName: string, customPathOverride?: string): Promise<string | null> {
  try {
    if (!process.env.IMPACT_ACCOUNT_SID || !process.env.IMPACT_AUTH_TOKEN || !process.env.IMPACT_HUMBLE_PROGRAM_ID || !process.env.IMPACT_GMG_PROGRAM_ID) {
      console.error("[Impact] Missing environment variables");
      return null;
    }

    let programID;
    if (bundleStore === "gmg") { programID = process.env.IMPACT_GMG_PROGRAM_ID; };
    if (bundleStore === "humble") { programID = process.env.IMPACT_HUMBLE_PROGRAM_ID; };
    const editedMachineName = bundleMachineName.replace(/_(games|books|book|software)?bundle$/, "");
    const customPath = customPathOverride || ("dsc_" + editedMachineName);
    const url = `https://api.impact.com/Mediapartners/${process.env.IMPACT_ACCOUNT_SID}/Programs/${programID}/TrackingLinks?CustomPath=${encodeURIComponent(customPath)}&DeepLink=${encodeURIComponent(bundleLink)}&Type=vanity&SubId1=Instabundles&SubId2=${encodeURIComponent(editedMachineName)}`;
    const auth = Buffer.from(`${process.env.IMPACT_ACCOUNT_SID}:${process.env.IMPACT_AUTH_TOKEN}`).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": `Basic ${auth}`,
        "Content-Length": "0",
      },
    });

    if (!res.ok) {
      console.log(url);
      const err = await res.text();
      console.error(`[Impact] Request failed: ${res.status} ${res.statusText} - ${err}`);
      return null;
    }

    const data = await res.json();
    
    console.log(`[Impact] Generated tracking link for ${bundleMachineName}: ${data.TrackingURL}`);
    return data.TrackingURL ? "https://" + data.TrackingURL : null;

  } catch (error) {
    console.error(`[Impact] Error generating tracking link for ${bundleLink}:`, error);
    return null;
  }
}