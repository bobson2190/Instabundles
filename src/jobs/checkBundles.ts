// src/jobs/checkBundles.ts
import { checkHumbleBundles } from "../scrapers/humble";
import { checkFanaticalBundles } from "../scrapers/fanatical";
import { checkGmgBundles } from "../scrapers/gmg";

export async function runBundleChecks() {
  await checkHumbleBundles();
  await checkFanaticalBundles();
  await checkGmgBundles();
}
