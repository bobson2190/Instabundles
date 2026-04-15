import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getBundle } from '../../db/bundles.repo'; // You need to ensure this exists!

export const data = new SlashCommandBuilder()
  .setName('bundle')
  .setDescription('Lookup a bundle details')
  .addStringOption(option =>
    option.setName('store')
      .setDescription('The store to search')
      .setRequired(true)
      .addChoices(
        { name: 'Humble Bundle', value: 'humble' },
        { name: 'Fanatical', value: 'fanatical' },
        { name: 'Green Man Gaming', value: 'gmg' }
      ))
  .addStringOption(option =>
    option.setName('id')
      .setDescription('The bundle ID or slug')
      .setRequired(true));

export async function handleBundleCommand(interaction: ChatInputCommandInteraction) {
  const store = interaction.options.getString('store', true);
  const id = interaction.options.getString('id', true);

  // 1. Defer Reply (Scraping/DB calls might take > 3 seconds)
  await interaction.deferReply();

  // 2. Fetch from DB
  const bundle = await getBundle(store, id);

  if (!bundle) {
    await interaction.editReply({ 
        content: `❌ **Bundle not found.**\nCould not find a bundle on **${store}** with ID/Slug: \`${id}\`.` 
    });
    return;
  }

  // 3. Build the Embed
  // Format items list (limit to 15 to prevent huge messages)
  const itemsList = bundle.items.length > 0 
    ? bundle.items.slice(0, 15).map(i => `• [${i.name}](${i.url || ''})`).join('\n')
    : 'No items listed.';
    
  const remainingCount = bundle.items.length - 15;
  const footerText = remainingCount > 0 ? `...and ${remainingCount} more items.` : '';

  // Format Tiers (if available)
  let tierText = '';
  if (bundle.tiers && bundle.tiers.length > 0) {
      tierText = '\n\n**💰 Pricing Tiers:**\n' + bundle.tiers.map(t => {
          // Flatten price array: "10 USD / 9 EUR"
          const prices = t.price.map(p => `${p.amount} ${p.currency}`).join(' / ');
          return `• ${prices}`;
      }).join('\n');
  }

  const embed = new EmbedBuilder()
    .setTitle(bundle.name)
    .setURL(bundle.url)
    .setColor(store === 'humble' ? '#BE1E2D' : store === 'fanatical' ? '#F7931E' : '#5DA600')
    .setThumbnail(bundle.imageUrl || null)
    .setDescription(`**Store:** ${store.toUpperCase()}\n**ID:** \`${bundle.externalId}\`\n${tierText}\n\n**🎮 Games included:**\n${itemsList}\n${footerText}`)
    .setFooter({ text: `Ends at` })
    .setTimestamp(bundle.endsAt);

  // 4. Send
  await interaction.editReply({ embeds: [embed] });
}