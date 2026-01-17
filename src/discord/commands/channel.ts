import { ChatInputCommandInteraction, PermissionFlagsBits, ChannelType } from 'discord.js';
import { upsertChannel, removeChannel } from '../../db/bundles.repo';

export async function handleChannelCommand(interaction: ChatInputCommandInteraction) {
  // Check for Administrator permission
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "❌ You need Administrator permissions to use this.", ephemeral: true });
  }

  const subCommand = interaction.options.getSubcommand();
  const channel = interaction.options.getChannel('channel') || interaction.channel;

  if (subCommand === 'add') {
    const platformsInput = interaction.options.getString('platforms') || 'humble,fanatical,gmg';
    const platforms = platformsInput.toLowerCase().split(',').map((p: string) => p.trim());
    
    await upsertChannel(channel!.id, interaction.guildId!, platforms);
    await interaction.reply({ content: `✅ Subscribed <#${channel!.id}> to: **${platforms.join(', ')}**`, ephemeral: true });
  } 
  
  else if (subCommand === 'remove') {
    await removeChannel(channel!.id);
    await interaction.reply({ content: `🗑️ Removed <#${channel!.id}> from notifications.`, ephemeral: true });
  }
}