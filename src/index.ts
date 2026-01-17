import 'dotenv/config';
import { startDiscordBot } from './discord/index';
import { checkHumbleBundles } from './scrapers/humble';
import { checkFanaticalBundles } from './scrapers/fanatical';
import { checkGmgBundles } from './scrapers/gmg';

async function runScraperCycle() {
  console.log(`[Cron] Starting scraper cycle at ${new Date().toISOString()}`);
  try {
    await checkHumbleBundles();
    await checkFanaticalBundles();
    await checkGmgBundles();
    console.log('[Cron] Cycle complete.');
  } catch (error) {
    console.error('[Cron] Critical error in scraper cycle:', error);
  }

  if (!process.env.INTERVAL) {console.log("[Cron] INTERVAL not set, defaulting to 10 minutes.");}
  // Defaults to 10 minutes if INTERVAL is not set
  setTimeout(runScraperCycle, parseInt(process.env.INTERVAL || '600000'));
}

async function main() {
  try {
    await startDiscordBot();
    runScraperCycle();
    
  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

main();