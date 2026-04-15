import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, ForumChannel, ChannelType, ThreadChannel, WebhookClient } from "discord.js";
import { client, isKillSwitchActive } from "./index";
import { ParsedBundle } from "../types/bundle";
import { getSubscribedChannels, getImpactLink, lookupImpactLink, updateBundleThreadId, getExpiringBundles, markBundleReminded, getReminderConfig, getBundleThreadId } from "../db/bundles.repo"; 
import { getSteamLink } from "../utils/steam";
import util from 'util';

const originalLog = console.log;
const originalError = console.error;
let logWebhook: WebhookClient | null = null;

const STORE_CONFIG = {
  humble: { name: "Humble Bundle", color: 0xcf392b, allBundlesUrl: "https://humblebundleinc.sjv.io/dsc_allBundles", bookBundlesUrl: "https://humblebundleinc.sjv.io/dsc_allBooks", subdomain: "humblebundleinc" },
  fanatical: { name: "Fanatical", color: 0xfaa61a, allBundlesUrl: "https://www.fanatical.com/en/bundle", bookBundlesUrl: "https://www.fanatical.com/en/bundle/books", subdomain: null },
  gmg: { name: "Green Man Gaming", color: 0x56c429, allBundlesUrl: "https://greenmangaming.sjv.io/dsc_allBundles", bookBundlesUrl: null, subdomain: "greenmangaming"}
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  EUR: "€",
  USD: "$",
};

const urlICONS = {
  humble: `https://cdn.discordapp.com/emojis/${process.env.HUMBLE_ICON}.webp`, 
  fanatical: `https://cdn.discordapp.com/emojis/${process.env.FANATICAL_ICON}.webp`,
  gmg: `https://cdn.discordapp.com/emojis/${process.env.GMG_ICON}.webp`
};

const ICONS = {
  humble: `<:humble:${process.env.HUMBLE_ICON}>`, 
  fanatical: `<:fanatical:${process.env.FANATICAL_ICON}>`,
  gmg: `<:gmg:${process.env.GMG_ICON}>`
};

const BUNDLE_CONFIG = {
  'humble': { tags: ['Game Bundle', 'Humble', 'Humble Bundle', 'HumbleBundle'] },
  'humblebooks': { tags: ['Book Bundle', 'Humble Books', 'HumbleBooks', 'Humble', 'Humble Bundle', 'HumbleBundle'] },
  'choice': { tags: ['Game Bundle', 'Humble Choice'] },
  'fanatical': { tags: ['Game Bundle', 'Fanatical'] },
  'gmg': { tags: ['Game Bundle', 'Green Man Gaming'] }
};

async function checkForumThreadExists(forum: ForumChannel, bundleName: string): Promise<ThreadChannel | null> {
  try {
    // Fetch active threads
    const activeThreads = await forum.threads.fetchActive();
    
    // Check active threads
    for (const [, thread] of activeThreads.threads) {
      if (thread.name === bundleName) {
        return thread;
      }
    }
    
    // Fetch archived threads
    const archivedThreads = await forum.threads.fetchArchived();
    
    // Check archived threads
    for (const [, thread] of archivedThreads.threads) {
      if (thread.name === bundleName) {
        return thread;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error checking forum threads:`, error);
    return null; // If error, allow posting to avoid missing bundles
  }
}

export async function notifyNewBundle(bundle: ParsedBundle) {
  if (isKillSwitchActive()) {
    console.log(`[Notifier] Skipping notification for ${bundle.name} (Kill Switch Active)`);
    return;
  }

  // Shorten title if it exceeds 100 characters (Discord limit for forum threads)
  if (bundle.name.length >= 100) {
    bundle.name = bundle.name.substring(0, 96) + "...";
  }

  const config = STORE_CONFIG[bundle.store as keyof typeof STORE_CONFIG];
  // Fallback to text if emoji fails
  const merchantEmoji = urlICONS[bundle.store as keyof typeof urlICONS] || "🎮"; 
  const merchantTextEmoji = ICONS[bundle.store as keyof typeof ICONS] || "🎮";
  
  // countdown and date
  let descriptionLine = "";
  if (bundle.endsAt) {
    const unixTime = Math.floor(bundle.endsAt.getTime() / 1000);
    // <t:X:R> = "in 22 days", <t:X:f> = "Wednesday, February 4, 2026 9:00"
    descriptionLine = `Offer ends <t:${unixTime}:R> • <t:${unixTime}:f>`;
  }

  // Prepare details embed early to add fields
  const detailsEmbed = new EmbedBuilder()
    .setColor(config.color)
    .setFooter({ 
        text: `${config.name}`,
        iconURL: `${merchantEmoji}`
    })
    .setTimestamp();

  const tiers = bundle.tiers as any[];
  const hasTieredItems = tiers && tiers.some((t: any) => t.items && t.items.length > 0);

  // Resolve Steam Links for all items
  if (bundle.type !== 'book') {
    await Promise.all(bundle.items.map(async (item) => {
        if (!item.url) {
            const steamUrl = await getSteamLink(item.name);
            if (steamUrl) {
                item.url = steamUrl;
            }
        }
    }));
  }

  if (hasTieredItems) {
    // NEW TIERED DISPLAY
    let cumulativeCount = 0;
    const useInline = tiers.length > 3;

    tiers.forEach((t, index) => {
        cumulativeCount += t.items ? t.items.length : 0;
        const prices = t.price
          .filter((p: any) => ["GBP", "EUR", "USD"].includes(p.currency))
          .map((p: any) => {
              const symbol = CURRENCY_SYMBOLS[p.currency] || p.currency;
              return `${symbol}${p.amount.toFixed(2)}`;
          })
          .join(" / ");

        let label = "";
        if (index == 0) label = "1st Tier";
        else if (index == 1) label = "2nd Tier";
        else if (index == 2) label = "3rd Tier";
        else label = `${index + 1}th Tier`;

        const priceString = prices ? ` for ~${prices}` : "";
        const fieldName = `${label}${priceString} (${cumulativeCount} Items)`;
        let fieldBody = "";

        if (index > 0) {
            fieldBody += `_Includes items from previous tiers_`;
        }

        const tierItems = t.items || [];
        let itemLines: string[];

        if (bundle.type === 'book') {
            itemLines = formatBookItems(tierItems);
        } else {
            itemLines = tierItems.map((item: any) => {
                if (item.url) {
                    return `• [${item.name}](${item.url})`;
                } else {
                    return `• ${item.name}`;
                }
            });
        }
        
        const MAX_FIELD_LENGTH = 1024;
        let displayedCount = 0;

        for (const line of itemLines) {
            const ellipsis = `\n... and ${itemLines.length - displayedCount} more items.`;
            const lineToAdd = (fieldBody.length > 0 ? "\n" : "") + line;

            if (fieldBody.length + lineToAdd.length + ellipsis.length > MAX_FIELD_LENGTH) {
                break;
            }
            
            fieldBody += lineToAdd;
            displayedCount++;
        }

        if (displayedCount < itemLines.length) {
            fieldBody += `\n... and ${itemLines.length - displayedCount} more items.`;
        }
        
        detailsEmbed.addFields({ name: fieldName, value: fieldBody || "No items", inline: useInline });
    });
  } else if (bundle.tiers && bundle.tiers.length > 0) {
    // OLD DISPLAY (Fanatical, GMG, etc)
    let priceSection = "";
    
    bundle.tiers.forEach((t, index) => {
      const prices = t.price
        .filter(p => ["GBP", "EUR", "USD"].includes(p.currency))
        .map(p => {
            const symbol = CURRENCY_SYMBOLS[p.currency] || p.currency;
            return `${symbol}${p.amount.toFixed(2)}`;
        })
        .join(" / ");
      
      let label = "";
      if (t.quantity) {
          label = `• **${t.quantity}+ items**`;
      } else if (!t.quantity && index == 0) {
          label = `• **1st Tier**`; 
      } else if (!t.quantity && index == 1) {
          label = `• **2nd Tier**`; 
      } else if (!t.quantity && index == 2) {
          label = `• **3rd Tier**`; 
      } else if (!t.quantity && index >= 3) {
          label = `• **${index + 1}th Tier**`; 
      }

      if (prices) { // Only add line if prices exist
          priceSection += `${label} for ${prices}\n`;
      }
    });
    
    if (priceSection) {
        detailsEmbed.addFields({ name: "Price Tiers:", value: priceSection, inline: false });
    }
  }

  // 3. Items List String
  // Only show the generic items list if we haven't already shown them in tiers
  if (!hasTieredItems) {
      const itemsList: string[] = [];
      for (const item of bundle.items) {
          const url = item.url;
          itemsList.push(url ? `• [${item.name}](${url})` : `• ${item.name}`);
      }

      let itemsBody = "";
      let displayedCount = 0;
      const MAX_CHARS = 1000;

      for (const line of itemsList) {
          if (itemsBody.length + line.length + 25 > MAX_CHARS) {
              break;
          }
          if (itemsBody.length > 0) itemsBody += "\n";
          itemsBody += line;
          displayedCount++;
          
          if (displayedCount >= 20) break;
      }

      if (displayedCount < itemsList.length) {
          itemsBody += `\n... and ${itemsList.length - displayedCount} others!`;
      } else if (itemsList.length === 0) {
          itemsBody = "No items listed.";
      }
      
      detailsEmbed.addFields({ name: `Items (${bundle.items.length}):`, value: itemsBody, inline: false });
  }

  // embed 1
  let firstEmbedUrl = bundle.url;
  const impactLink = await getImpactLink(bundle.store, bundle.externalId, bundle.isChoice);
  let itExists: boolean;

  if (impactLink) {
    firstEmbedUrl = impactLink;
    itExists = true;
  } else if (bundle.store === "humble") { 
    if (await lookupImpactLink(bundle.store, bundle.externalId, bundle.isChoice)) {
      itExists = true;
      if (bundle.isChoice) {
          const nameParts = bundle.name.split(' ');
          if (nameParts.length >= 2 && /^\d{4}$/.test(nameParts[1])) {
              firstEmbedUrl = `https://humblebundleinc.sjv.io/dsc_${nameParts[0].toLowerCase()}-${nameParts[1]}Choice`;
          }
      } else {
          firstEmbedUrl = "https://humblebundleinc.sjv.io/dsc_" + bundle.externalId.replace("_bundle", ""); 
      }
    } else {
      firstEmbedUrl = bundle.url;
    }
  }
  if (bundle.store === "gmg") { 
    if (await lookupImpactLink(bundle.store, bundle.externalId, false)) {
      itExists = true;
      firstEmbedUrl = "https://greenmangaming.sjv.io/dsc_" + bundle.externalId;
    } else {
      firstEmbedUrl = bundle.url;
    }
   }
  const headerEmbed = new EmbedBuilder()
    .setTitle(bundle.name)
    .setURL(firstEmbedUrl)
    .setColor(config.color)
    .setImage(bundle.imageUrl || null)
    .setFooter({text: `By using these links, you support the server at no extra cost. Thank you!`});

  // Add the countdown to description if it exists
  if (descriptionLine) {
      headerEmbed.setDescription(descriptionLine);
  }

  // buttons
  const row = new ActionRowBuilder<ButtonBuilder>();
  
  // 1. View Bundle
  if (bundle.store === "humble" || bundle.store === "gmg") {
    const url = impactLink || firstEmbedUrl;
    row.addComponents(
      new ButtonBuilder()
      .setLabel("View Bundle")
      .setStyle(ButtonStyle.Link)
      .setURL(url)
    ); 
  } else {
    row.addComponents(
      new ButtonBuilder()
      .setLabel("View Bundle")
      .setStyle(ButtonStyle.Link)
      .setURL(bundle.url)
    ); 
  }

  let btnAllBundlesUrl: string = config.allBundlesUrl;
  if (bundle.type === "book" && config.bookBundlesUrl) { btnAllBundlesUrl = config.bookBundlesUrl; }

  // 2. All Bundles
  row.addComponents(
    new ButtonBuilder()
        .setLabel("All Bundles")
        .setStyle(ButtonStyle.Link)
        .setURL(btnAllBundlesUrl)
  );

  // send to channels
  let platform = bundle.store;
  if (bundle.isChoice) {
    platform = 'choice';
  } else if (bundle.store === 'humble' && bundle.type === 'book') {
    platform = 'humblebooks';
  }

  const channels = await getSubscribedChannels(platform); 
  const isTestMode = process.argv.includes('--test');
  
  for (const { id: channelId} of channels) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) continue;

      const payload = { 
          embeds: [headerEmbed, detailsEmbed], 
          components: [row] 
      };

      if (channel.type === ChannelType.GuildForum) {
        const forum = channel as ForumChannel;
        
        const config = BUNDLE_CONFIG[platform as keyof typeof BUNDLE_CONFIG];
        const tagIds = forum.availableTags
          .filter(tag => config.tags.includes(tag.name))
          .map(tag => tag.id);
        
        const existingThread = await checkForumThreadExists(forum, bundle.name); // does thread exist?
        
        if (existingThread) {
          // Ensure DB is linked to this thread (Backfill fix)
          await updateBundleThreadId(bundle.store, bundle.externalId, existingThread.id);
        }

        if (existingThread && !isTestMode) {
          console.log(`Skipping duplicate bundle "${bundle.name}" in forum ${channelId}`);
          continue; // is test?
        } else if (existingThread && isTestMode) {
          console.log(`[TEST MODE] Posting duplicate bundle "${bundle.name}" in forum ${channelId}`);
        } // is test?

        const thread = await forum.threads.create({
          name: bundle.name,
          message: payload,
          appliedTags: tagIds
        });

        await updateBundleThreadId(bundle.store, bundle.externalId, thread.id);
      } else if (channel.isTextBased()) {
        const message = await (channel as TextChannel).send(payload);
        await updateBundleThreadId(bundle.store, bundle.externalId, message.id);
      }
    } catch (error) {
      console.error(`Failed to send to channel ${channelId}`, error);
    }
  }
}

export async function checkForExpiry() {
  if (isKillSwitchActive()) {
    console.log(`[Notifier] Skipping reminder check (Kill Switch Active)`);
    return;
  }

  const hours = parseInt(process.env.REMINDER_HOURS || "24");
  const bundles = await getExpiringBundles(hours);
  console.log(`[Notifier] Checking for expiring bundles... Found ${bundles.length}.`);

  for (const bundle of bundles) {
    if (!bundle.threadId || bundle.threadId.length === 0) continue;

    // Handle both single string (legacy) and array (new) just in case, though DB returns array now
    const threadIds = Array.isArray(bundle.threadId) ? bundle.threadId : [bundle.threadId];

    for (const tid of threadIds) {
        try {
          const thread = await client.channels.fetch(tid) as ThreadChannel;
          if (!thread) continue;

          const config = await getReminderConfig(thread.guildId);
          
          let message = `**Ending Soon!**\nThis bundle expires in less than ${hours} hours!`;
          if (config && config.roleId) {
            message += ` <@&${config.roleId}>`;
          }

          await thread.send(message);

          if (config && config.channelId) {
            const extraChannel = await client.channels.fetch(config.channelId) as TextChannel;
            if (extraChannel) {
                 const embed = new EmbedBuilder()
                    .setTitle(`Expiring: ${bundle.name}`)
                    .setDescription(`This bundle is ending soon! View Thread`)
                    .setColor(0xFF0000);
                 await extraChannel.send({ content: config.roleId ? `<@&${config.roleId}>` : undefined, embeds: [embed] });
            }
          }
        } catch (error) {
          console.error(`Failed to send reminder for ${bundle.name} in thread ${tid}`, error);
        }
    }
    await markBundleReminded(bundle.store, bundle.externalId);
  }
}

export async function notifyExtension(bundle: ParsedBundle, oldEndsAt: Date) {
  const threadIds = await getBundleThreadId(bundle.store, bundle.externalId);
  if (!threadIds || threadIds.length === 0) return;

  for (const tid of threadIds) {
    try {
        const thread = await client.channels.fetch(tid) as ThreadChannel;
        if (thread && bundle.endsAt) {
            const unixTime = Math.floor(bundle.endsAt.getTime() / 1000);
            await thread.send(`📅 **Bundle Extended!**\nThe new end date is <t:${unixTime}:f> (<t:${unixTime}:R>).`);
        }
    } catch (error) {
        console.error(`Failed to send extension notification for ${bundle.name} in thread ${tid}`, error);
    }
  }
}

if (process.env.LOG_WEBHOOK_URL) { // setup webhook
  logWebhook = new WebhookClient({ url: process.env.LOG_WEBHOOK_URL });
}

function sendToWebhook(msg: string, isError: boolean = false) {
  // process.stdout.write(`${msg}`);
  if (!logWebhook) {
    process.stderr.write("[Logger] Error: No webhook in .env");
    return;
  }
    if (!msg || msg.trim().length === 0) {
    process.stderr.write("[Logger] Error: Empty message");
    return;
    }

  const content = isError ? `**Error:** \`${msg}\`\n||@here||` : ` \`${msg}\``;

  logWebhook.send({ content }).catch(e => {
    process.stdout.write(`[Logger Error] Failed to send to webhook: ${e.message}\n`);
  });
}

console.log = function(...args) { // overrides console.log
  originalLog.apply(console, args);
  const msg = util.format(...args);
  sendToWebhook(msg, false);
};

console.error = function(...args) { // overrides console.error
  originalError.apply(console, args);
  const msg = util.format(...args);
  sendToWebhook(msg, true);
};

function formatBookItems(items: any[]): string[] {
    const lines: string[] = [];
    const seriesMap = new Map<string, { prefix: string, separator: string, volumes: number[] }>();
    
    // Regex to capture "Name" + "Vol/Book/#" + "Number"
    // Examples: "Saga Vol 1", "Saga Vol. 1", "Saga #1", "Saga Book 1"
    const seriesRegex = /^(.*?)(\s+(?:Vol\.?|Volume|#|Book|Part)\s*)(\d+)$/i;

    // First pass: Identify series
    items.forEach((item) => {
        const match = item.name.match(seriesRegex);
        if (match) {
            const key = match[1].toLowerCase().trim();
            if (!seriesMap.has(key)) {
                seriesMap.set(key, {
                    prefix: match[1].trim(),
                    separator: match[2],
                    volumes: []
                });
            }
            seriesMap.get(key)!.volumes.push(parseInt(match[3], 10));
        }
    });

    const printedSeries = new Set<string>();

    items.forEach((item) => {
        const match = item.name.match(seriesRegex);
        let isGrouped = false;

        if (match) {
            const key = match[1].toLowerCase().trim();
            const group = seriesMap.get(key);
            // Only group if there are at least 2 volumes
            if (group && group.volumes.length > 1) {
                isGrouped = true;
                if (!printedSeries.has(key)) {
                    group.volumes.sort((a, b) => a - b);
                    const vols = group.volumes.join(", ").replace(/, ([^,]*)$/, ' and $1');
                    lines.push(`• ${group.prefix}${group.separator}${vols}`);
                    printedSeries.add(key);
                }
            }
        }

        if (!isGrouped) {
             if (item.url) {
                 lines.push(`• ${item.name}`);
             } else {
                 lines.push(`• ${item.name}`);
             }
        }
    });

    return lines;
}