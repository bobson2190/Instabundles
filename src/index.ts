import 'dotenv/config';
import { startDiscordBot } from './discord/index';
import { checkHumbleBooks, checkHumbleBundles, checkHumbleChoice} from './scrapers/humble';
import { checkFanaticalBundles } from './scrapers/fanatical';
import { checkGmgBundles } from './scrapers/gmg';
import { checkForExpiry } from './discord/notifier';

async function runScraperCycle() {
  console.log(`[Cron] Started at ${new Date().toTimeString()}`);
  
  try {
    await checkHumbleBundles();
    await checkFanaticalBundles();
    await checkGmgBundles();
    await checkHumbleBooks();
    await checkForExpiry();
    console.log('[Cron] Cycle complete.');
  } catch (error) {
    console.error('[Cron] Critical error in scraper cycle:', error);
  }

  scheduleNextRun();
}

function scheduleNextRun() {
  const now = new Date();
  
  // 1. Get total interval and extract the "extra" seconds
  const intervalMs = parseInt(process.env.INTERVAL || '610000');
  const intervalMinutes = Math.floor(intervalMs / 60000); // 10
  const extraMs = intervalMs % 60000; // 10000 (the 10 seconds)

  // 2. Calculate ms until the next clean 10-minute mark (e.g., 22:10:00.000)
  const minutesPastLastMark = now.getMinutes() % intervalMinutes;
  const minutesToNextMark = intervalMinutes - minutesPastLastMark;
  
  const msToNextCleanMark = 
    (minutesToNextMark * 60 * 1000) - 
    (now.getSeconds() * 1000) - 
    now.getMilliseconds();

  // 3. Add the extra offset to the delay
  let delay = msToNextCleanMark + extraMs;

  // 4. If we already passed the :10 mark for this window, 
  // subtract one interval to jump to the next one
  if (delay > intervalMs) {
    delay -= (intervalMinutes * 60 * 1000);
  }
  
  // 5. Final safety check: if delay is too small or negative, push to next cycle
  if (delay <= 0) {
    delay += (intervalMinutes * 60 * 1000);
  }

  const nextDate = new Date(now.getTime() + delay);
  console.log(`[Cron] Next run scheduled in ${Math.round(delay / 1000)}s | at ${nextDate.toTimeString()}`);
  
  setTimeout(runScraperCycle, delay);
}

function scheduleHumbleChoice() {
  const now = new Date();
  
  const getFirstTuesday = (year: number, month: number) => {
    const date = new Date(year, month, 1, 19, 1, 0, 0);
    const day = date.getDay();
    const daysUntilTuesday = (2 - day + 7) % 7;
    date.setDate(date.getDate() + daysUntilTuesday);
    return date;
  };

  let target = getFirstTuesday(now.getFullYear(), now.getMonth());

  // If we've already passed this time this month, move to next month
  if (target.getTime() <= now.getTime()) {
    target = getFirstTuesday(now.getFullYear(), now.getMonth() + 1);
  }

  const delay = target.getTime() - now.getTime();
  // Handle 32-bit signed integer overflow for setTimeout (approx 24.8 days)
  const maxDelay = 2147483647;
  
  if (delay > maxDelay) {
    console.log(`[Cron] Next Humble Choice check is on ${target.toDateString()}. Waiting 24 days (max timeout)...`);
    setTimeout(scheduleHumbleChoice, maxDelay);
    return;
  }

  console.log(`[Cron] Next Humble Choice check scheduled for ${target.toString()}`);

  setTimeout(async () => {
    console.log('[Cron] Running scheduled Humble Choice check...');
    try {
      await checkHumbleChoice();
    } catch (error) {
      console.error('[Cron] Error running Humble Choice check:', error);
    }
    scheduleHumbleChoice();
  }, delay);
}

async function main() {
  try {
    await startDiscordBot();
    console.log('[Startup] Checking Humble Choice...');
    await checkHumbleChoice(true);
    runScraperCycle();
    scheduleHumbleChoice();
    
  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

main();