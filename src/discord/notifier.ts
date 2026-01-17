import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, ForumChannel, ChannelType } from "discord.js";
import { client } from "./index";
import { ParsedBundle } from "../types/bundle";
import { getSteamLink } from "../utils/steam";
import { generateImpactLink } from "../utils/impact";
import { getSubscribedChannels, insertImpactLink, lookupImpactLink } from "../db/bundles.repo"; 

const STORE_CONFIG = {
  humble: { name: "Humble Bundle", color: 0xcf392b, allBundlesUrl: "https://humblebundleinc.sjv.io/dsc_allBundles" },
  fanatical: { name: "Fanatical", color: 0xfaa61a, allBundlesUrl: "https://www.fanatical.com/en/bundles" },
  gmg: { name: "Green Man Gaming", color: 0x56c429, allBundlesUrl: "https://www.greenmangamingbundles.com/", }
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

export async function notifyNewBundle(bundle: ParsedBundle) {
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

  // price tiers
  let priceSection = "";
  if (bundle.tiers && bundle.tiers.length > 0) {
    priceSection += "**Price Tiers:**\n";
    
    // Iterate with Index to generate "1st Tier", "2nd Tier", etc.
    bundle.tiers.forEach((t, index) => {
      const prices = t.price
        .filter(p => ["GBP", "EUR", "USD"].includes(p.currency))
        .map(p => {
            const symbol = CURRENCY_SYMBOLS[p.currency] || p.currency;
            // Humble is already float, Fanatical is int (handled in parser). 
            // Just display as fixed.
            return `${symbol}${p.amount.toFixed(2)}`;
        })
        .join(" / ");
      
      // LOGIC: If quantity is explicitly set (Fanatical), use it. 
      // If not (Humble), assume 1st Tier, 2nd Tier based on sort order.
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
    priceSection += "\n"; 
  }

  // 3. Items List String
  const itemsList: string[] = [];
  for (const item of bundle.items) {
      // Try steam lookup, fallback to name
      const steamUrl = await getSteamLink(item.name);
      itemsList.push(steamUrl ? `• [${item.name}](${steamUrl})` /*| [​${merchantTextEmoji}](${item.storeUrl}) */ : `• ${item.name}`);
  }

  // character limit check
  const MAX_ITEMS_TO_SHOW = 20;
  let itemsSection = `**Items (${bundle.items.length}):**\n`;
  
  if (itemsList.length > 0) {
      itemsSection += itemsList.slice(0, MAX_ITEMS_TO_SHOW).join("\n");
      if (itemsList.length > MAX_ITEMS_TO_SHOW) {
          itemsSection += `\n... and ${itemsList.length - MAX_ITEMS_TO_SHOW} others!`;
      }
  } else {
      itemsSection += "No items listed.";
  }

  // embed 1
  const firstEmbedUrl = bundle.url;
  if (bundle.store === "humble") { const firstEmbedUrl = "https://humblebundleinc.sjv.io/dsc_" + bundle.externalId.replace("_bundle", "") || bundle.url; }
  const headerEmbed = new EmbedBuilder()
    .setTitle(bundle.name)
    .setURL(firstEmbedUrl || bundle.url)
    .setColor(config.color)
    .setImage(bundle.imageUrl || null)
    .setFooter({text: `By using these links, you support the server at no extra cost. Thank you!`});

  // Add the countdown to description if it exists
  if (descriptionLine) {
      headerEmbed.setDescription(descriptionLine);
  }

  // embed 2
  const detailsEmbed = new EmbedBuilder()
    .setColor(config.color)
    .setDescription(priceSection + itemsSection)
    .setFooter({ 
        text: `${config.name}`,
        iconURL: `${merchantEmoji}`
    })
    .setTimestamp();

  // buttons
  const row = new ActionRowBuilder<ButtonBuilder>();
  
  // 1. View Bundle
  if (bundle.store === "humble") { // FIX LATER, THIS ONLY HAS HUMBLE
    if (await lookupImpactLink(bundle.store, bundle.externalId)) {
      row.addComponents(
      new ButtonBuilder()
      .setLabel("View Bundle")
      .setStyle(ButtonStyle.Link)
      .setURL("https://humblebundleinc.sjv.io/dsc_" + bundle.externalId.replace("_bundle", "") || bundle.url));
    } else {
      const impactBundleLink = await generateImpactLink(bundle.url, bundle.externalId);
      if (impactBundleLink) { await insertImpactLink(bundle.externalId, impactBundleLink, bundle.store); }

      row.addComponents(
        new ButtonBuilder()
        .setLabel("View Bundle")
        .setStyle(ButtonStyle.Link)
        .setURL(impactBundleLink || bundle.url)
    ); }}
    else {
    row.addComponents(
      new ButtonBuilder()
      .setLabel("View Bundle")
      .setStyle(ButtonStyle.Link)
      .setURL(bundle.url)
  ); }

  // 2. All Bundles
  row.addComponents(
    new ButtonBuilder()
        .setLabel("All Bundles")
        .setStyle(ButtonStyle.Link)
        .setURL(config.allBundlesUrl)
  );

  // send to channels
  const channelIds = await getSubscribedChannels(bundle.store); 
  
  for (const channelId of channelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) continue;

      const payload = { 
          embeds: [headerEmbed, detailsEmbed], 
          components: [row] 
      };

      if (channel.type === ChannelType.GuildForum) {
        await (channel as ForumChannel).threads.create({
          name: bundle.name,
          message: payload
        });
      } else if (channel.isTextBased()) {
        await (channel as TextChannel).send(payload);
      }
    } catch (error) {
      console.error(`Failed to send to channel ${channelId}`, error);
    }
  }
}